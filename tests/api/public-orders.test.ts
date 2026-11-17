import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { POST as orderPOST } from '@/app/api/orders/route'
import { POST as quotePOST } from '@/app/api/cart/quote/route'
import { resetOrderThrottle } from '@/lib/order-throttle'
import { runAfterResponse } from '@/lib/after-response'
import { sanitizeLines } from '@/lib/cart/cart'

const saved = { ...process.env }
beforeEach(() => {
  resetOrderThrottle()
  process.env.TRUST_PROXY = '1'
})
afterEach(() => {
  process.env = { ...saved }
  vi.restoreAllMocks()
})

async function mkVariant(stock = 5000) {
  const cat = await prisma.category.create({ data: { slug: 'c', name: { en: 'c' } } })
  const p = await prisma.product.create({
    data: {
      slug: 'p', categoryId: cat.id, status: 'PUBLISHED', title: { en: 'T' }, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [],
      highlights: [], inTheBox: [], faq: [], specs: [], images: [], reviewed: { uz: false, ru: false },
      variants: { create: [{ sku: 'V1', name: { en: 'Black' }, priceUzs: 1_000_000, stock }] },
    },
    include: { variants: true },
  })
  return p.variants[0]
}

const form = { name: 'Ali Valiyev', phone: '+998 90 123-45-67', region: 'tashkent-city', address: 'Amir Temur 1', locale: 'uz' }
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
const order = (lines: unknown, headers?: Record<string, string>) => orderPOST(post('/api/orders', { ...form, lines }, headers) as never)

describe('POST /api/orders hardening', () => {
  it('throttles to 5 orders per 10 minutes per ip -> 429 RATE_LIMITED; other ips unaffected', async () => {
    const v = await mkVariant()
    for (let i = 0; i < 5; i++) expect((await order([{ variantId: v.id, qty: 1 }])).status).toBe(201)
    const r = await order([{ variantId: v.id, qty: 1 }])
    expect(r.status).toBe(429)
    expect(await r.json()).toEqual({ error: 'RATE_LIMITED' })
    expect((await order([{ variantId: v.id, qty: 1 }], { 'x-forwarded-for': '2.2.2.2' })).status).toBe(201)
  })
  it('rejected (invalid) attempts do not use up the budget', async () => {
    const v = await mkVariant()
    for (let i = 0; i < 8; i++) expect((await order([{ variantId: v.id, qty: 0 }])).status).toBe(400)
    expect((await order([{ variantId: v.id, qty: 1 }])).status).toBe(201)
  })
  it('blocked client -> 403 BLOCKED with nothing else revealed, no order, and the throttle budget is not used', async () => {
    const v = await mkVariant()
    await prisma.customer.create({ data: { phone: '+998901234567', name: 'Bad', region: 'tashkent-city', tags: [], blocked: true } })
    for (let i = 0; i < 8; i++) {
      const r = await order([{ variantId: v.id, qty: 1 }])
      expect(r.status).toBe(403)
      expect(await r.json()).toEqual({ error: 'BLOCKED' })
    }
    expect(await prisma.order.count()).toBe(0)
    await prisma.customer.update({ where: { phone: '+998901234567' }, data: { blocked: false } })
    expect((await order([{ variantId: v.id, qty: 1 }])).status).toBe(201)
  })
  it('unexpected errors -> 500 SERVER (not INVALID)', async () => {
    const v = await mkVariant()
    vi.spyOn(prisma, '$transaction').mockRejectedValue(new Error('db down'))
    const r = await order([{ variantId: v.id, qty: 1 }])
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'SERVER' })
  })
  it('out-of-range variantId is INVALID, not a server error', async () => {
    await mkVariant()
    for (const variantId of [0, -1, 2147483648, 1e20]) {
      const r = await order([{ variantId, qty: 1 }])
      expect(r.status, String(variantId)).toBe(400)
      expect(await r.json()).toEqual({ error: 'INVALID' })
    }
  })
  it('merged qty per line is capped at 999', async () => {
    const v = await mkVariant()
    const r = await order([{ variantId: v.id, qty: 600 }, { variantId: v.id, qty: 600 }])
    expect(r.status).toBe(201)
    const line = await prisma.orderLine.findFirstOrThrow()
    expect(line.qty).toBe(999)
  })
  it('bodies over 32 KB -> 413 (declared and actual size)', async () => {
    const big = JSON.stringify({ ...form, lines: [], pad: 'x'.repeat(33 * 1024) })
    expect((await orderPOST(post('/api/orders', '{}', { 'content-length': String(40_000) }) as never)).status).toBe(413)
    expect((await orderPOST(post('/api/orders', big) as never)).status).toBe(413)
    expect((await orderPOST(post('/api/orders', big, { 'content-length': '10' }) as never)).status).toBe(413)
  })
})

describe('POST /api/cart/quote hardening', () => {
  const quote = (body: unknown, headers?: Record<string, string>) => quotePOST(post('/api/cart/quote', body, headers) as never)
  it('caps qty at 999 and drops out-of-range variant ids', async () => {
    const v = await mkVariant()
    const r = await quote({ locale: 'uz', lines: [{ variantId: v.id, qty: 5000 }, { variantId: 2147483648, qty: 1 }, { variantId: 0, qty: 1 }] })
    expect(r.status).toBe(200)
    const q = await r.json()
    expect(q.items).toHaveLength(1)
    expect(q.items[0].qty).toBe(999)
  })
  it('413 for big bodies, 500 SERVER on unexpected errors', async () => {
    expect((await quote({ lines: [], pad: 'x'.repeat(33 * 1024) })).status).toBe(413)
    expect((await quote('{}', { 'content-length': '50000' })).status).toBe(413)
    await mkVariant()
    vi.spyOn(prisma.variant, 'findMany').mockRejectedValue(new Error('db down'))
    const r = await quote({ lines: [{ variantId: 1, qty: 1 }] })
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'SERVER' })
  })
})

describe('cart line sanitizing', () => {
  it('bounds variantId to 1..2147483647 and caps merged qty at 999', () => {
    expect(sanitizeLines([{ variantId: 0, qty: 1 }, { variantId: 2147483648, qty: 1 }, { variantId: 2147483647, qty: 1 }])).toEqual([{ variantId: 2147483647, qty: 1 }])
    expect(sanitizeLines([{ variantId: 3, qty: 700 }, { variantId: 3, qty: 700 }])).toEqual([{ variantId: 3, qty: 999 }])
  })
})

describe('runAfterResponse', () => {
  it('outside a request scope it still runs the task (fire-and-forget) and swallows errors', async () => {
    const task = vi.fn(async () => {
      throw new Error('telegram down')
    })
    expect(() => runAfterResponse(task)).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(task).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/orders delivery pin', () => {
  it('stores a valid lat/lng pair rounded to 6 decimals', async () => {
    const v = await mkVariant()
    const r = await orderPOST(post('/api/orders', { ...form, lines: [{ variantId: v.id, qty: 1 }], location: { lat: 41.3110814, lng: 69.240562 } }) as never)
    expect(r.status).toBe(201)
    const { number } = await r.json()
    const o = await prisma.order.findUnique({ where: { number } })
    expect([o!.lat, o!.lng]).toEqual([41.311081, 69.240562])
  })
  it('half a pair or out of range -> 400 INVALID, no order', async () => {
    const v = await mkVariant()
    const before = await prisma.order.count()
    for (const location of [{ lat: 41.3 }, { lat: 'x', lng: 69 }, { lat: 100, lng: 69 }]) {
      const r = await orderPOST(post('/api/orders', { ...form, lines: [{ variantId: v.id, qty: 1 }], location }, { 'x-forwarded-for': '9.9.9.9' }) as never)
      expect(r.status).toBe(400)
      expect(await r.json()).toEqual({ error: 'INVALID' })
    }
    expect(await prisma.order.count()).toBe(before)
  })
  it('no location -> order without a pin', async () => {
    const v = await mkVariant()
    const r = await order([{ variantId: v.id, qty: 1 }])
    const { number } = await r.json()
    const o = await prisma.order.findUnique({ where: { number } })
    expect([o!.lat, o!.lng]).toEqual([null, null])
  })
})

describe('POST /api/orders CSRF (appsec review: Mini App session cookie is SameSite=None)', () => {
  it('cross-site Origin -> 403, no order', async () => {
    const v = await mkVariant()
    const before = await prisma.order.count()
    const r = await order([{ variantId: v.id, qty: 1 }], { origin: 'https://evil.example' })
    expect(r.status).toBe(403)
    expect(await prisma.order.count()).toBe(before)
  })
  it('text/plain body (simple cross-site form) -> 415, no order', async () => {
    const v = await mkVariant()
    const r = await orderPOST(post('/api/orders', { ...form, lines: [{ variantId: v.id, qty: 1 }] }, { 'content-type': 'text/plain' }) as never)
    expect(r.status).toBe(415)
  })
  it('same-site Origin is fine', async () => {
    const v = await mkVariant()
    const r = await order([{ variantId: v.id, qty: 1 }], { origin: 'http://localhost:3000', host: 'localhost:3000' })
    expect(r.status).toBe(201)
  })
})
