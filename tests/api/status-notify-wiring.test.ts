import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { NextRequest } from 'next/server'
import { createSession, SESSION_COOKIE } from '@/lib/auth'

// Both ways staff change an order status (admin page action, admin API) must trigger the customer's Telegram message.
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
  headers: async () => new Headers(),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
const notify = vi.fn(async (_orderId: number, _to?: string) => 'sent' as const)
const placed = vi.fn(async (_number: number) => 'sent' as const)
vi.mock('@/lib/account/notify', () => ({
  notifyOrderStatus: (id: number, to?: string) => notify(id, to),
  notifyOrderPlaced: (n: number) => placed(n),
}))

const { setOrderStatusAction } = await import('@/app/admin/actions')
const { POST } = await import('@/app/api/admin/orders/[id]/status/route')

const saved = { ...process.env }
beforeEach(() => {
  process.env.SESSION_SECRET = 'z'.repeat(40)
  process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = 'true'
  jar.clear()
  notify.mockClear()
  placed.mockClear()
})
afterEach(() => {
  process.env = { ...saved }
})

async function adminToken() {
  const u = await prisma.adminUser.create({ data: { email: 'ops@shop.uz', name: 'Ops', role: 'ADMIN', active: true, passwordHash: 'x' } })
  return createSession({ uid: u.id, role: 'ADMIN', sv: u.sessionVersion })
}
async function newOrder(number: number) {
  return prisma.order.create({
    data: { number, name: 'Ali', phone: '+998901234567', region: 'tashkent-city', address: 'Chilonzor 1', locale: 'ru', totalUzs: 100_000 },
  })
}
const flush = () => new Promise((r) => setTimeout(r, 20))

describe('order status change notifies the customer', () => {
  it('admin action: success notifies once with the order id; a refused transition does not', async () => {
    jar.set(SESSION_COOKIE, await adminToken())
    const o = await newOrder(5001)
    expect(await setOrderStatusAction(o.id, 'CANCELLED')).toEqual({ ok: true })
    await flush()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(o.id, 'CANCELLED')
    expect(await setOrderStatusAction(o.id, 'CONFIRMED')).toMatchObject({ ok: false })
    await flush()
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('admin API route: success notifies; 409 does not', async () => {
    const token = await adminToken()
    const o = await newOrder(5002)
    const call = (to: string) =>
      POST(
        new NextRequest(`http://localhost/api/admin/orders/${o.id}/status`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE}=${token}`, origin: 'http://localhost', host: 'localhost' },
          body: JSON.stringify({ to }),
        }),
        { params: Promise.resolve({ id: String(o.id) }) },
      )
    jar.set(SESSION_COOKIE, token)
    expect((await call('CANCELLED')).status).toBe(200)
    await flush()
    expect(notify).toHaveBeenCalledWith(o.id, 'CANCELLED')
    expect((await call('CONFIRMED')).status).toBe(409)
    await flush()
    expect(notify).toHaveBeenCalledTimes(1)
  })
})


describe('order placed -> customer notice', () => {
  it('POST /api/orders schedules notifyOrderPlaced with the new number; a refused order does not', async () => {
    const { POST: orderPOST } = await import('@/app/api/orders/route')
    const { resetOrderThrottle } = await import('@/lib/order-throttle')
    resetOrderThrottle()
    const cat = await prisma.category.create({ data: { slug: 'wire-c', name: { en: 'c' } } })
    const p = await prisma.product.create({
      data: {
        slug: 'wire-p', categoryId: cat.id, status: 'PUBLISHED', title: { en: 'P' }, subtitle: {}, shortSpec: {}, descriptionHtml: {},
        sections: [], highlights: [], inTheBox: [], faq: [], specs: [], images: [], reviewed: {},
      },
    })
    const v = await prisma.variant.create({ data: { productId: p.id, sku: 'WIRE-1', name: { en: 'v' }, priceUzs: 100_000, stock: 5 } })
    const body = (lines: unknown) =>
      new Request('http://localhost:3000/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Ali Valiyev', phone: '+998901234567', region: 'tashkent-city', address: 'Amir Temur 1', locale: 'uz', lines }),
      })
    const ok = await orderPOST(body([{ variantId: v.id, qty: 1 }]) as never)
    expect(ok.status).toBe(201)
    const { number } = await ok.json()
    await new Promise((r) => setTimeout(r, 0))
    expect(placed).toHaveBeenCalledWith(number)
    placed.mockClear()
    await orderPOST(body([{ variantId: v.id, qty: 999 }]) as never)
    await new Promise((r) => setTimeout(r, 0))
    expect(placed).not.toHaveBeenCalled()
  })
})
