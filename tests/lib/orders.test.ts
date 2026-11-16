import { describe, it, expect, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { createOrder, setOrderStatus, quoteCart } from '@/lib/orders'
import { updateSettings } from '@/lib/settings'

async function mkVariant(o: { sku: string; price: number; stock: number; status?: string }) {
  const cat = (await prisma.category.findFirst()) ?? (await prisma.category.create({ data: { slug: 'c', name: { en: 'c' } } }))
  const p = await prisma.product.create({
    data: {
      slug: `p-${o.sku}`,
      categoryId: cat.id,
      status: o.status ?? 'PUBLISHED',
      title: { en: `Title ${o.sku}`, uz: `Nom ${o.sku}` },
      subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [], inTheBox: [], faq: [], specs: [],
      images: ['https://img/x.jpg'],
      reviewed: { uz: false, ru: false },
      variants: { create: [{ sku: o.sku, name: { en: 'Black' }, priceUzs: o.price, stock: o.stock }] },
    },
    include: { variants: true },
  })
  return p.variants[0]
}

const base = { name: 'Ali Valiyev', phone: '+998 90 123-45-67', region: 'tashkent-city', address: 'Amir Temur 1', locale: 'uz' as const }

describe('createOrder', () => {
  it('creates order with DB prices, snapshot, number 1001 then 1002', async () => {
    const v = await mkVariant({ sku: 'A', price: 100000, stock: 10 })
    const r1 = await createOrder({ ...base, lines: [{ variantId: v.id, qty: 2 }] })
    expect(r1).toEqual({ ok: true, number: 1001 })
    const r2 = await createOrder({ ...base, lines: [{ variantId: v.id, qty: 1 }] })
    expect(r2).toEqual({ ok: true, number: 1002 })
    const o = await prisma.order.findUnique({ where: { number: 1001 }, include: { lines: true } })
    expect(o!.totalUzs).toBe(200000)
    expect(o!.status).toBe('NEW')
    expect(o!.phone).toBe('+998901234567')
    expect(o!.lines[0]).toMatchObject({ sku: 'A', variantName: 'Black', priceUzs: 100000, qty: 2, variantId: v.id, productTitle: 'Nom A' })
    // stock untouched at creation
    expect((await prisma.variant.findUnique({ where: { id: v.id } }))!.stock).toBe(10)
  })
  it('ignores tampered client price', async () => {
    const v = await mkVariant({ sku: 'B', price: 100000, stock: 10 })
    const r = await createOrder({ ...base, lines: [{ variantId: v.id, qty: 1, priceUzs: 1 } as never], totalUzs: 1 } as never)
    expect(r.ok).toBe(true)
    const o = await prisma.order.findFirst()
    expect(o!.totalUzs).toBe(100000)
  })
  it('sums duplicate lines for the same variant against stock', async () => {
    const v = await mkVariant({ sku: 'D', price: 10, stock: 3 })
    const r = await createOrder({ ...base, lines: [{ variantId: v.id, qty: 2 }, { variantId: v.id, qty: 2 }] })
    expect(r).toEqual({ ok: false, error: 'OUT_OF_STOCK' })
  })
  it('BELOW_MIN', async () => {
    await updateSettings({ minOrderUzs: 500000 })
    const v = await mkVariant({ sku: 'C', price: 100000, stock: 10 })
    expect(await createOrder({ ...base, lines: [{ variantId: v.id, qty: 4 }] })).toEqual({ ok: false, error: 'BELOW_MIN' })
    expect(await createOrder({ ...base, lines: [{ variantId: v.id, qty: 5 }] })).toMatchObject({ ok: true })
    expect(await prisma.order.count()).toBe(1)
  })
  it('qty > stock -> OUT_OF_STOCK', async () => {
    const v = await mkVariant({ sku: 'E', price: 1000, stock: 2 })
    expect(await createOrder({ ...base, lines: [{ variantId: v.id, qty: 3 }] })).toEqual({ ok: false, error: 'OUT_OF_STOCK' })
  })
  it('unpublished / missing variant -> INVALID', async () => {
    const v = await mkVariant({ sku: 'F', price: 1000, stock: 2, status: 'DRAFT' })
    expect(await createOrder({ ...base, lines: [{ variantId: v.id, qty: 1 }] })).toEqual({ ok: false, error: 'INVALID' })
    expect(await createOrder({ ...base, lines: [{ variantId: 99999, qty: 1 }] })).toEqual({ ok: false, error: 'INVALID' })
  })
  it('INVALID for bad input', async () => {
    const v = await mkVariant({ sku: 'G', price: 1000, stock: 2 })
    const lines = [{ variantId: v.id, qty: 1 }]
    expect(await createOrder({ ...base, lines: [] })).toMatchObject({ error: 'INVALID' })
    expect(await createOrder({ ...base, lines: [{ variantId: v.id, qty: 0 }] })).toMatchObject({ error: 'INVALID' })
    expect(await createOrder({ ...base, lines: [{ variantId: v.id, qty: 1.5 }] })).toMatchObject({ error: 'INVALID' })
    expect(await createOrder({ ...base, lines, name: ' ' })).toMatchObject({ error: 'INVALID' })
    expect(await createOrder({ ...base, lines, phone: '123' })).toMatchObject({ error: 'INVALID' })
    expect(await createOrder({ ...base, lines, address: '' })).toMatchObject({ error: 'INVALID' })
    expect(await createOrder({ ...base, lines, region: 'mars' })).toMatchObject({ error: 'INVALID' })
    expect(await createOrder({ ...base, lines, locale: 'de' as never })).toMatchObject({ error: 'INVALID' })
    expect(await prisma.order.count()).toBe(0)
  })
  it('notifies without failing the order when notifier rejects', async () => {
    const notify = vi.fn().mockRejectedValue(new Error('boom'))
    const v = await mkVariant({ sku: 'H', price: 1000, stock: 5 })
    const r = await createOrder({ ...base, lines: [{ variantId: v.id, qty: 1 }] }, { notify })
    expect(r.ok).toBe(true)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toMatchObject({ number: 1001, totalUzs: 1000 })
  })
})

describe('quoteCart', () => {
  it('returns items from DB, marks unavailable', async () => {
    await updateSettings({ minOrderUzs: 300 })
    const v = await mkVariant({ sku: 'Q', price: 1000, stock: 4 })
    const d = await mkVariant({ sku: 'QD', price: 5000, stock: 4, status: 'DRAFT' })
    const q = await quoteCart([{ variantId: v.id, qty: 2 }, { variantId: d.id, qty: 1 }, { variantId: 424242, qty: 1 }], 'en')
    expect(q.minOrderUzs).toBe(300)
    expect(q.totalUzs).toBe(2000)
    expect(q.items).toHaveLength(3)
    expect(q.items[0]).toMatchObject({ variantId: v.id, title: 'Title Q', variantName: 'Black', image: 'https://img/x.jpg', priceUzs: 1000, stock: 4, available: true })
    expect(q.items[1].available).toBe(false)
    expect(q.items[2].available).toBe(false)
  })
})

describe('setOrderStatus', () => {
  async function mkOrder(variantId: number, qty: number) {
    const r = await createOrder({ ...base, lines: [{ variantId, qty }] })
    if (!r.ok) throw new Error('setup')
    return (await prisma.order.findUnique({ where: { number: r.number } }))!
  }
  const stock = async (id: number) => (await prisma.variant.findUnique({ where: { id } }))!.stock

  it('confirm decrements; cancel after confirm restores', async () => {
    const v = await mkVariant({ sku: 'S1', price: 1000, stock: 5 })
    const o = await mkOrder(v.id, 2)
    expect(await setOrderStatus(o.id, 'CONFIRMED')).toEqual({ ok: true })
    expect(await stock(v.id)).toBe(3)
    expect(await setOrderStatus(o.id, 'CANCELLED')).toEqual({ ok: true })
    expect(await stock(v.id)).toBe(5)
    expect((await prisma.order.findUnique({ where: { id: o.id } }))!.status).toBe('CANCELLED')
  })
  it('NEW -> CANCELLED leaves stock', async () => {
    const v = await mkVariant({ sku: 'S2', price: 1000, stock: 5 })
    const o = await mkOrder(v.id, 2)
    expect(await setOrderStatus(o.id, 'CANCELLED')).toEqual({ ok: true })
    expect(await stock(v.id)).toBe(5)
  })
  it('two orders for last unit: second confirm INSUFFICIENT_STOCK, never negative', async () => {
    const v = await mkVariant({ sku: 'S3', price: 1000, stock: 1 })
    const o1 = await mkOrder(v.id, 1)
    const o2 = await mkOrder(v.id, 1)
    expect(await setOrderStatus(o1.id, 'CONFIRMED')).toEqual({ ok: true })
    expect(await setOrderStatus(o2.id, 'CONFIRMED')).toEqual({ ok: false, error: 'INSUFFICIENT_STOCK' })
    expect(await stock(v.id)).toBe(0)
    expect((await prisma.order.findUnique({ where: { id: o2.id } }))!.status).toBe('NEW')
  })
  it('multi-line: failing line rolls back earlier decrements', async () => {
    const a = await mkVariant({ sku: 'S4a', price: 1000, stock: 5 })
    const b = await mkVariant({ sku: 'S4b', price: 1000, stock: 0 })
    const o = await prisma.order.create({
      data: {
        number: 5000, name: 'x', phone: 'p', region: 'r', address: 'a', locale: 'uz', totalUzs: 2000,
        lines: { create: [
          { variantId: a.id, sku: 'S4a', productTitle: 't', variantName: 'n', priceUzs: 1000, qty: 1 },
          { variantId: b.id, sku: 'S4b', productTitle: 't', variantName: 'n', priceUzs: 1000, qty: 1 },
        ] },
      },
    })
    expect(await setOrderStatus(o.id, 'CONFIRMED')).toEqual({ ok: false, error: 'INSUFFICIENT_STOCK' })
    expect(await stock(a.id)).toBe(5)
  })
  it('CONFIRMED -> DELIVERED ok, DELIVERED -> NEW BAD_TRANSITION', async () => {
    const v = await mkVariant({ sku: 'S5', price: 1000, stock: 5 })
    const o = await mkOrder(v.id, 1)
    await setOrderStatus(o.id, 'CONFIRMED')
    expect(await setOrderStatus(o.id, 'DELIVERED')).toEqual({ ok: true })
    expect(await setOrderStatus(o.id, 'NEW')).toEqual({ ok: false, error: 'BAD_TRANSITION' })
    expect(await setOrderStatus(o.id, 'CANCELLED')).toEqual({ ok: false, error: 'BAD_TRANSITION' })
    expect(await stock(v.id)).toBe(4)
  })
  it('NEW -> DELIVERED and unknown order are BAD_TRANSITION', async () => {
    const v = await mkVariant({ sku: 'S6', price: 1000, stock: 5 })
    const o = await mkOrder(v.id, 1)
    expect(await setOrderStatus(o.id, 'DELIVERED')).toEqual({ ok: false, error: 'BAD_TRANSITION' })
    expect(await setOrderStatus(987654, 'CONFIRMED')).toEqual({ ok: false, error: 'BAD_TRANSITION' })
  })
})
