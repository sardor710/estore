import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { POST as orderPOST } from '@/app/api/orders/route'
import { POST as notifyPOST } from '@/app/api/payments/octo/notify/route'
import { POST as payPOST } from '@/app/api/payments/octo/pay/route'
import { POST as refundPOST } from '@/app/api/admin/orders/[id]/refund/route'
import { resetOrderThrottle } from '@/lib/order-throttle'

const saved = { ...process.env }
let octoStatusFor: (tx: string) => Record<string, unknown> = () => ({ status: 'created', total_sum: 1_000_000 })
let prepareFails = false
const octoCalls: { url: string; body: Record<string, unknown> }[] = []

beforeEach(() => {
  resetOrderThrottle()
  process.env.TRUST_PROXY = '1'
  process.env.OCTO_SHOP_ID = '43297'
  process.env.OCTO_SECRET = 'secret-xyz'
  process.env.OCTO_TEST = '1'
  octoStatusFor = () => ({ status: 'created', total_sum: 1_000_000 })
  prepareFails = false
  octoCalls.length = 0
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (!String(url).startsWith('https://secure.octo.uz/')) throw new Error(`unexpected fetch ${url}`)
    const body = JSON.parse(String(init?.body ?? '{}'))
    octoCalls.push({ url: String(url), body })
    if ('total_sum' in body) {
      if (prepareFails) return new Response(JSON.stringify({ error: 5, errMessage: 'Service unavailable' }))
      const tx = body.shop_transaction_id
      return new Response(JSON.stringify({ error: 0, data: { octo_payment_UUID: `uuid-${tx}`, status: 'created', octo_pay_url: `https://pay2.octo.uz/pay/uuid-${tx}` } }))
    }
    return new Response(JSON.stringify({ error: 0, data: { octo_payment_UUID: `uuid-${body.shop_transaction_id}`, ...octoStatusFor(String(body.shop_transaction_id)) } }))
  })
})
afterEach(() => {
  process.env = { ...saved }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function mkVariant() {
  const cat = await prisma.category.create({ data: { slug: 'c', name: { en: 'c' } } })
  const p = await prisma.product.create({
    data: {
      slug: 'p', categoryId: cat.id, status: 'PUBLISHED', title: { en: 'T' }, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [],
      highlights: [], inTheBox: [], faq: [], specs: [], images: [], reviewed: { uz: false, ru: false },
      variants: { create: [{ sku: 'V1', name: { en: 'Black' }, priceUzs: 1_000_000, stock: 50 }] },
    },
    include: { variants: true },
  })
  return p.variants[0]
}
const form = { name: 'Ali Valiyev', phone: '+998 90 123-45-67', region: 'tashkent-city', address: 'Amir Temur 1', locale: 'uz' }
const req = (url: string, body: unknown) =>
  new Request(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1' },
    body: JSON.stringify(body),
  })
async function placeCard() {
  const v = await mkVariant()
  const res = await orderPOST(req('/api/orders', { ...form, payment: 'card', lines: [{ variantId: v.id, qty: 1 }] }) as never)
  return { res, data: (await res.json()) as { number: number; token: string; payUrl?: string; payError?: boolean } }
}

describe('POST /api/orders with card payment', () => {
  it('creates the order, a Payment and returns the Octo link + token', async () => {
    const { res, data } = await placeCard()
    expect(res.status).toBe(201)
    expect(data.payUrl).toBe(`https://pay2.octo.uz/pay/uuid-zanko-${data.number}-1`)
    expect(data.token).toMatch(/^[A-Za-z0-9_-]{32}$/)
    const o = await prisma.order.findUniqueOrThrow({ where: { number: data.number }, include: { payments: true } })
    expect(o).toMatchObject({ payMethod: 'CARD', paymentStatus: 'PENDING', paymentProvider: 'octo', payToken: data.token })
    expect(o.payments).toHaveLength(1)
    expect(octoCalls[0].body.total_sum).toBe(1_000_000)
  })
  it('cash orders are unchanged: no token, no Octo call', async () => {
    const v = await mkVariant()
    const res = await orderPOST(req('/api/orders', { ...form, lines: [{ variantId: v.id, qty: 1 }] }) as never)
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data).toEqual({ number: data.number })
    const o = await prisma.order.findUniqueOrThrow({ where: { number: data.number } })
    expect(o).toMatchObject({ payMethod: 'CASH', paymentStatus: 'UNPAID', payToken: null })
    expect(octoCalls).toHaveLength(0)
  })
  it('keeps the order and reports payError when Octo fails', async () => {
    prepareFails = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { res, data } = await placeCard()
    expect(res.status).toBe(201)
    expect(data.payError).toBe(true)
    expect(data.payUrl).toBeUndefined()
    expect(await prisma.order.count({ where: { number: data.number } })).toBe(1)
  })
  it('refuses card orders when Octo is not configured, creating nothing', async () => {
    delete process.env.OCTO_SECRET
    const { res, data } = await placeCard()
    expect(res.status).toBe(400)
    expect((data as unknown as { error: string }).error).toBe('CARD_UNAVAILABLE')
    expect(await prisma.order.count()).toBe(0)
  })
})

describe('POST /api/payments/octo/notify', () => {
  it('ignores a forged "succeeded" body while Octo itself says created', async () => {
    const { data } = await placeCard()
    const res = await notifyPOST(req('/api/payments/octo/notify', { shop_transaction_id: `zanko-${data.number}-1`, status: 'succeeded', total_sum: 1_000_000 }) as never)
    expect(res.status).toBe(200)
    expect((await prisma.order.findUniqueOrThrow({ where: { number: data.number } })).paymentStatus).toBe('PENDING')
  })
  it('marks PAID when Octo confirms', async () => {
    const { data } = await placeCard()
    octoStatusFor = () => ({ status: 'succeeded', total_sum: 1_000_000, maskedPan: '418451** **** 1111', card_vendor: 'Visa' })
    const res = await notifyPOST(req('/api/payments/octo/notify', { shop_transaction_id: `zanko-${data.number}-1` }) as never)
    expect(res.status).toBe(200)
    expect((await prisma.order.findUniqueOrThrow({ where: { number: data.number } })).paymentStatus).toBe('PAID')
  })
  it('answers 200 for an unknown id or junk, changing nothing', async () => {
    for (const body of [{ shop_transaction_id: 'zanko-1-1' }, { nope: 1 }, 'garbage']) {
      const res = await notifyPOST(new Request('http://localhost:3000/api/payments/octo/notify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }) as never)
      expect(res.status).toBe(200)
    }
    expect(octoCalls).toHaveLength(0)
  })
})

describe('POST /api/payments/octo/pay', () => {
  it('makes a new attempt with the right token', async () => {
    const { data } = await placeCard()
    const res = await payPOST(req('/api/payments/octo/pay', { number: data.number, token: data.token }) as never)
    expect(res.status).toBe(200)
    expect((await res.json()).payUrl).toBe(`https://pay2.octo.uz/pay/uuid-zanko-${data.number}-2`)
  })
  it('404 with a wrong token', async () => {
    const { data } = await placeCard()
    const res = await payPOST(req('/api/payments/octo/pay', { number: data.number, token: 'x'.repeat(32) }) as never)
    expect(res.status).toBe(404)
  })
  it('409 once the order is paid', async () => {
    const { data } = await placeCard()
    octoStatusFor = () => ({ status: 'succeeded', total_sum: 1_000_000 })
    await notifyPOST(req('/api/payments/octo/notify', { shop_transaction_id: `zanko-${data.number}-1` }) as never)
    const res = await payPOST(req('/api/payments/octo/pay', { number: data.number, token: data.token }) as never)
    expect(res.status).toBe(409)
  })
})

describe('admin refund route', () => {
  it('requires an admin session', async () => {
    const { data } = await placeCard()
    const o = await prisma.order.findUniqueOrThrow({ where: { number: data.number } })
    const res = await refundPOST(new NextRequest(`http://localhost:3000/api/admin/orders/${o.id}/refund`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), { params: Promise.resolve({ id: String(o.id) }) } as never)
    expect([401, 403]).toContain(res.status)
    expect(octoCalls.some((c) => c.url.endsWith('/refund'))).toBe(false)
  })
})
