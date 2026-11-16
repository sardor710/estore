import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import middleware from '@/proxy'
import { createSession, SESSION_COOKIE } from '@/lib/auth'
import { GET as ordersGET } from '@/app/api/admin/orders/route'
import { POST as statusPOST } from '@/app/api/admin/orders/[id]/status/route'
import { prisma } from '@/lib/db'

const saved = { ...process.env }
beforeEach(() => {
  process.env.ADMIN_USER = 'owner'
  process.env.ADMIN_PASSWORD = 'pw'
  process.env.SESSION_SECRET = 'z'.repeat(40)
  process.env.SITE_URL = 'http://localhost:3000'
})
afterEach(() => {
  process.env = { ...saved }
})

const url = (p: string) => `http://localhost:3000${p}`
async function cookie() {
  return `${SESSION_COOKIE}=${await createSession('owner')}`
}
const req = (p: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(url(p), { method: init.method ?? 'GET', headers: init.headers })
const passes = (res: Response) => res.headers.get('x-middleware-next') === '1'

describe('middleware guard', () => {
  it('/api/admin/* without cookie -> 401 JSON', async () => {
    const res = await middleware(req('/api/admin/orders'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })
  it('/api/admin/* with garbage cookie -> 401', async () => {
    const res = await middleware(req('/api/admin/orders', { headers: { cookie: `${SESSION_COOKIE}=nope` } }))
    expect(res.status).toBe(401)
  })
  it('/api/admin/* with valid cookie passes through', async () => {
    expect(passes(await middleware(req('/api/admin/orders', { headers: { cookie: await cookie() } })))).toBe(true)
  })
  it('/admin without cookie redirects to /admin/login; login page and login API are open', async () => {
    const res = await middleware(req('/admin/products'))
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/admin/login')
    expect(passes(res)).toBe(false)
    expect(passes(await middleware(req('/admin/login')))).toBe(true)
    expect(passes(await middleware(req('/api/admin/login', { method: 'POST' })))).toBe(true)
  })
  it('/admin with valid cookie passes', async () => {
    expect(passes(await middleware(req('/admin', { headers: { cookie: await cookie() } })))).toBe(true)
  })
  it('public routes still go through next-intl', async () => {
    const res = await middleware(req('/products'))
    expect(res.headers.get('location')).toContain('/uz/products')
  })
})

describe('route handlers re-verify the session', () => {
  it('GET /api/admin/orders: 401 without cookie, 200 with', async () => {
    expect((await ordersGET(req('/api/admin/orders'), {})).status).toBe(401)
    const ok = await ordersGET(req('/api/admin/orders', { headers: { cookie: await cookie() } }), {})
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ orders: [] })
  })
  it('cross-origin POST -> 403 even with a valid cookie', async () => {
    const res = await statusPOST(
      req('/api/admin/orders/1/status', {
        method: 'POST',
        headers: { cookie: await cookie(), origin: 'https://evil.example', host: 'localhost:3000', 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '1' }) },
    )
    expect(res.status).toBe(403)
  })
  it('cross-site Sec-Fetch-Site without Origin -> 403', async () => {
    const res = await statusPOST(
      req('/api/admin/orders/1/status', { method: 'POST', headers: { cookie: await cookie(), 'sec-fetch-site': 'cross-site' } }),
      { params: Promise.resolve({ id: '1' }) },
    )
    expect(res.status).toBe(403)
  })
  it('same-origin POST without cookie -> 401', async () => {
    const res = await statusPOST(
      req('/api/admin/orders/1/status', { method: 'POST', headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } }),
      { params: Promise.resolve({ id: '1' }) },
    )
    expect(res.status).toBe(401)
  })
  it('same-origin authed POST changes status through setOrderStatus', async () => {
    const cat = await prisma.category.create({ data: { slug: 'c', name: { en: 'c' } } })
    const p = await prisma.product.create({
      data: {
        slug: 'p', categoryId: cat.id, title: {}, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [],
        inTheBox: [], faq: [], specs: [], images: [], reviewed: {},
        variants: { create: [{ sku: 'S1', name: {}, priceUzs: 10, stock: 5 }] },
      },
      include: { variants: true },
    })
    const o = await prisma.order.create({
      data: {
        number: 1001, name: 'a', phone: '+998901234567', region: 'r', address: 'x', locale: 'uz', totalUzs: 10,
        lines: { create: [{ variantId: p.variants[0].id, sku: 'S1', productTitle: 't', variantName: 'v', priceUzs: 10, qty: 2 }] },
      },
    })
    const mk = async (to: string) =>
      statusPOST(
        new NextRequest(url(`/api/admin/orders/${o.id}/status`), {
          method: 'POST',
          headers: { cookie: await cookie(), origin: 'http://localhost:3000', host: 'localhost:3000', 'content-type': 'application/json' },
          body: JSON.stringify({ to }),
        }),
        { params: Promise.resolve({ id: String(o.id) }) },
      )
    expect((await mk('CONFIRMED')).status).toBe(200)
    expect((await prisma.variant.findFirstOrThrow()).stock).toBe(3)
    const bad = await mk('NEW')
    expect(bad.status).toBe(409)
    expect(await bad.json()).toMatchObject({ error: 'BAD_TRANSITION' })
  })
})
