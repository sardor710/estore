import { describe, it, expect, vi, afterEach } from 'vitest'
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
    expect(r1).toMatchObject({ ok: true, number: 1001, payToken: null })
    const r2 = await createOrder({ ...base, lines: [{ variantId: v.id, qty: 1 }] })
    expect(r2).toMatchObject({ ok: true, number: 1002, payToken: null })
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

  describe('optional SHIPPING (out for delivery)', () => {
    it('CONFIRMED -> SHIPPING -> DELIVERED', async () => {
      const v = await mkVariant({ sku: 'SH1', price: 1000, stock: 5 })
      const o = await mkOrder(v.id, 1)
      expect(await setOrderStatus(o.id, 'CONFIRMED')).toEqual({ ok: true })
      expect(await setOrderStatus(o.id, 'SHIPPING')).toEqual({ ok: true })
      expect(await setOrderStatus(o.id, 'DELIVERED')).toEqual({ ok: true })
      expect(await stock(v.id)).toBe(4)
      const events = await prisma.orderStatusEvent.findMany({ where: { orderId: o.id }, orderBy: { id: 'asc' } })
      expect(events.map((e) => e.status)).toEqual(['NEW', 'CONFIRMED', 'SHIPPING', 'DELIVERED'])
    })
    it('CONFIRMED -> DELIVERED directly is still allowed', async () => {
      const v = await mkVariant({ sku: 'SH2', price: 1000, stock: 5 })
      const o = await mkOrder(v.id, 1)
      await setOrderStatus(o.id, 'CONFIRMED')
      expect(await setOrderStatus(o.id, 'DELIVERED')).toEqual({ ok: true })
    })
    it('NEW -> SHIPPING and DELIVERED -> SHIPPING are refused', async () => {
      const v = await mkVariant({ sku: 'SH3', price: 1000, stock: 5 })
      const o = await mkOrder(v.id, 1)
      expect(await setOrderStatus(o.id, 'SHIPPING')).toEqual({ ok: false, error: 'BAD_TRANSITION' })
      await setOrderStatus(o.id, 'CONFIRMED')
      await setOrderStatus(o.id, 'DELIVERED')
      expect(await setOrderStatus(o.id, 'SHIPPING')).toEqual({ ok: false, error: 'BAD_TRANSITION' })
    })
    it('SHIPPING -> CANCELLED restores stock', async () => {
      const v = await mkVariant({ sku: 'SH4', price: 1000, stock: 5 })
      const o = await mkOrder(v.id, 2)
      await setOrderStatus(o.id, 'CONFIRMED')
      expect(await setOrderStatus(o.id, 'SHIPPING')).toEqual({ ok: true })
      expect(await stock(v.id)).toBe(3)
      expect(await setOrderStatus(o.id, 'CANCELLED')).toEqual({ ok: true })
      expect(await stock(v.id)).toBe(5)
    })
  })
})

describe('promotions', () => {
  async function categoryPromo(enabled = true) {
    const cat = await prisma.category.findFirstOrThrow()
    return prisma.promotion.create({
      data: { name: 'Category -10%', kind: 'PERCENT', value: 10, targetType: 'CATEGORY', targetIds: [cat.id], enabled },
    })
  }

  it('active category promo: createOrder total uses the discounted price and the line records the discount', async () => {
    const v = await mkVariant({ sku: 'PR1', price: 1_290_000, stock: 5 })
    const promo = await categoryPromo()
    const r = await createOrder({ ...base, lines: [{ variantId: v.id, qty: 2 }] })
    expect(r).toMatchObject({ ok: true, number: 1001, payToken: null })
    const o = await prisma.order.findUniqueOrThrow({ where: { number: 1001 }, include: { lines: true } })
    expect(o.totalUzs).toBe(2 * 1_161_000)
    expect(o.lines[0]).toMatchObject({ priceUzs: 1_161_000, originalPriceUzs: 1_290_000, discountUzs: 129_000, promotionId: promo.id })
  })

  it('promo switched off before submit: full price, no discount recorded', async () => {
    const v = await mkVariant({ sku: 'PR2', price: 1_290_000, stock: 5 })
    const promo = await categoryPromo()
    await prisma.promotion.update({ where: { id: promo.id }, data: { enabled: false } })
    expect(await createOrder({ ...base, lines: [{ variantId: v.id, qty: 1 }] })).toMatchObject({ ok: true })
    const o = await prisma.order.findFirstOrThrow({ include: { lines: true } })
    expect(o.totalUzs).toBe(1_290_000)
    expect(o.lines[0]).toMatchObject({ priceUzs: 1_290_000, originalPriceUzs: 1_290_000, discountUzs: 0, promotionId: null })
  })

  it('quoteCart matches createOrder and reports the original price (equal without a promo, 0 when unavailable)', async () => {
    const v = await mkVariant({ sku: 'PR3', price: 1_290_000, stock: 5 })
    await categoryPromo()
    const plain = await mkVariant({ sku: 'PR3B', price: 50_000, stock: 5 })
    await prisma.product.update({ where: { id: plain.productId }, data: { categoryId: (await prisma.category.create({ data: { slug: 'other', name: { en: 'o' } } })).id } })
    const q = await quoteCart([{ variantId: v.id, qty: 2 }, { variantId: plain.id, qty: 1 }, { variantId: 424242, qty: 1 }], 'en')
    expect(q.items[0]).toMatchObject({ priceUzs: 1_161_000, originalUzs: 1_290_000 })
    expect(q.items[1]).toMatchObject({ priceUzs: 50_000, originalUzs: 50_000 })
    expect(q.items[2]).toMatchObject({ available: false, priceUzs: 0, originalUzs: 0 })
    expect(q.totalUzs).toBe(2 * 1_161_000 + 50_000)
  })
})

describe('status events and account options', () => {
  const evs = async (orderId: number) =>
    (await prisma.orderStatusEvent.findMany({ where: { orderId }, orderBy: { id: 'asc' } })).map((e) => e.status)

  it('createOrder writes a NEW event; successful status changes add events, failed ones do not', async () => {
    const v = await mkVariant({ sku: 'EV1', price: 100, stock: 1 })
    expect(await createOrder({ ...base, lines: [{ variantId: v.id, qty: 1 }] })).toMatchObject({ ok: true })
    expect(await createOrder({ ...base, lines: [{ variantId: v.id, qty: 1 }] })).toMatchObject({ ok: true })
    const [o1, o2] = await prisma.order.findMany({ orderBy: { number: 'asc' } })
    expect(await evs(o1.id)).toEqual(['NEW'])
    expect(await setOrderStatus(o1.id, 'CONFIRMED')).toEqual({ ok: true })
    expect(await setOrderStatus(o1.id, 'NEW')).toEqual({ ok: false, error: 'BAD_TRANSITION' })
    expect(await setOrderStatus(o2.id, 'CONFIRMED')).toEqual({ ok: false, error: 'INSUFFICIENT_STOCK' })
    expect(await evs(o1.id)).toEqual(['NEW', 'CONFIRMED'])
    expect(await evs(o2.id)).toEqual(['NEW'])
  })

  it('saveAddress: stored for the signed-in account (first is default), skipped for guests, duplicates and at the limit', async () => {
    const v = await mkVariant({ sku: 'EV2', price: 100, stock: 50 })
    const acc = await prisma.customer.create({
      data: { phone: '+998901234567', name: 'Ali', region: '', tags: [], telegramUserId: 't1', telegramChatId: 'c1', accountCreatedAt: new Date() },
    })
    const lines = [{ variantId: v.id, qty: 1 }]
    // guest (no accountCustomerId): nothing saved
    expect(await createOrder({ ...base, lines, saveAddress: { label: 'Home' } })).toMatchObject({ ok: true })
    expect(await prisma.customerAddress.count()).toBe(0)
    // signed in, asked
    expect(await createOrder({ ...base, lines, accountCustomerId: acc.id, saveAddress: { label: ' Home ' } })).toMatchObject({ ok: true })
    expect(await prisma.customerAddress.findMany()).toEqual([
      expect.objectContaining({ customerId: acc.id, label: 'Home', recipient: 'Ali Valiyev', region: 'tashkent-city', address: 'Amir Temur 1', isDefault: true }),
    ])
    // identical address again: not duplicated
    expect(await createOrder({ ...base, lines, accountCustomerId: acc.id, saveAddress: { label: 'Home' } })).toMatchObject({ ok: true })
    expect(await prisma.customerAddress.count()).toBe(1)
    // signed in, not asked
    expect(await createOrder({ ...base, address: 'Navoiy 5', lines, accountCustomerId: acc.id, saveAddress: null })).toMatchObject({ ok: true })
    expect(await prisma.customerAddress.count()).toBe(1)
    // at the limit: order still placed, no address
    for (let i = 0; i < 9; i++) {
      await prisma.customerAddress.create({ data: { customerId: acc.id, label: `L${i}`, recipient: 'Ali', region: 'tashkent-city', address: `Street ${i}` } })
    }
    expect(await createOrder({ ...base, address: 'Navoiy 6', lines, accountCustomerId: acc.id, saveAddress: { label: 'x' } })).toMatchObject({ ok: true })
    expect(await prisma.customerAddress.count()).toBe(10)
    expect(await prisma.customerAddress.count({ where: { isDefault: true } })).toBe(1)
  })

  it('saveAddress is ignored when the account does not own the order phone', async () => {
    const v = await mkVariant({ sku: 'EV3', price: 100, stock: 5 })
    const other = await prisma.customer.create({
      data: { phone: '+998907777777', name: 'Other', region: '', tags: [], telegramUserId: 't2', accountCreatedAt: new Date() },
    })
    expect(await createOrder({ ...base, lines: [{ variantId: v.id, qty: 1 }], accountCustomerId: other.id, saveAddress: { label: 'x' } })).toMatchObject({ ok: true })
    expect(await prisma.customerAddress.count()).toBe(0)
  })
})

describe('setOrderStatus → ERP outbox', () => {
  const saved = process.env.ERP_ENABLED
  afterEach(() => {
    if (saved === undefined) delete process.env.ERP_ENABLED
    else process.env.ERP_ENABLED = saved
  })
  async function confirmed(sku: string, qty: number, stock = 5, link = true) {
    const v = await mkVariant({ sku, price: 1000, stock })
    if (link) await prisma.variant.update({ where: { id: v.id }, data: { erpLinkedAt: new Date() } })
    const r = await createOrder({ ...base, lines: [{ variantId: v.id, qty }] })
    if (!r.ok) throw new Error('setup')
    const o = (await prisma.order.findUnique({ where: { number: r.number } }))!
    return { v, o }
  }

  it('confirm writes a DELIVER row in the same transaction', async () => {
    process.env.ERP_ENABLED = '1'
    const { o } = await confirmed('E1', 2)
    expect(await setOrderStatus(o.id, 'CONFIRMED')).toEqual({ ok: true })
    const rows = await prisma.erpOutbox.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ ref: `ZK-${o.id}`, kind: 'DELIVER', orderId: o.id, status: 'PENDING' })
    expect(rows[0].lines).toEqual([{ sku: 'E1', qty: 2, rateUzs: 1000 }])
  })

  it('flag off: no rows', async () => {
    delete process.env.ERP_ENABLED
    const { o } = await confirmed('E2', 1)
    await setOrderStatus(o.id, 'CONFIRMED')
    expect(await prisma.erpOutbox.count()).toBe(0)
  })

  it('a refused confirm writes nothing', async () => {
    process.env.ERP_ENABLED = '1'
    const { o } = await confirmed('E3', 3, 3)
    await prisma.variant.updateMany({ where: { sku: 'E3' }, data: { stock: 1 } })
    expect(await setOrderStatus(o.id, 'CONFIRMED')).toEqual({ ok: false, error: 'INSUFFICIENT_STOCK' })
    expect(await prisma.erpOutbox.count()).toBe(0)
  })

  it('cancel after the delivery reached ERP writes a RETURN row', async () => {
    process.env.ERP_ENABLED = '1'
    const { o } = await confirmed('E4', 1)
    await setOrderStatus(o.id, 'CONFIRMED')
    await prisma.erpOutbox.update({ where: { ref: `ZK-${o.id}` }, data: { status: 'DONE', erpDoc: 'DN-1' } })
    expect(await setOrderStatus(o.id, 'CANCELLED')).toEqual({ ok: true })
    expect(await prisma.erpOutbox.findUnique({ where: { ref: `ZK-${o.id}-R` } })).toMatchObject({ kind: 'RETURN', status: 'PENDING' })
  })

  it('cancel before the delivery was ever sent skips it instead of returning', async () => {
    process.env.ERP_ENABLED = '1'
    const { o } = await confirmed('E5', 1)
    await setOrderStatus(o.id, 'CONFIRMED')
    expect(await setOrderStatus(o.id, 'CANCELLED')).toEqual({ ok: true })
    expect(await prisma.erpOutbox.findUnique({ where: { ref: `ZK-${o.id}` } })).toMatchObject({ status: 'SKIPPED' })
    expect(await prisma.erpOutbox.count()).toBe(1)
  })

  it('cancel of an order confirmed before the ERP switch-over writes a RECEIPT row', async () => {
    delete process.env.ERP_ENABLED
    const { o } = await confirmed('E6', 2)
    await setOrderStatus(o.id, 'CONFIRMED')
    process.env.ERP_ENABLED = '1'
    expect(await setOrderStatus(o.id, 'CANCELLED')).toEqual({ ok: true })
    expect(await prisma.erpOutbox.findUnique({ where: { ref: `ZK-${o.id}-R` } })).toMatchObject({ kind: 'RECEIPT', status: 'PENDING' })
  })
})

describe('setOrderStatus → ERP outbox (review fixes)', () => {
  const saved = process.env.ERP_ENABLED
  afterEach(() => {
    if (saved === undefined) delete process.env.ERP_ENABLED
    else process.env.ERP_ENABLED = saved
  })
  async function order(lines: { sku: string; linked: boolean }[]) {
    const ids: number[] = []
    for (const l of lines) {
      const v = await mkVariant({ sku: l.sku, price: 500, stock: 5 })
      if (l.linked) await prisma.variant.update({ where: { id: v.id }, data: { erpLinkedAt: new Date() } })
      ids.push(v.id)
    }
    const r = await createOrder({ ...base, lines: ids.map((variantId) => ({ variantId, qty: 1 })) })
    if (!r.ok) throw new Error('setup')
    return (await prisma.order.findUnique({ where: { number: r.number } }))!
  }

  it('a DELIVER that was already attempted is not skipped on cancel (ERP may have it): a RETURN is queued', async () => {
    process.env.ERP_ENABLED = '1'
    const o = await order([{ sku: 'R1', linked: true }])
    await setOrderStatus(o.id, 'CONFIRMED')
    await prisma.erpOutbox.update({ where: { ref: `ZK-${o.id}` }, data: { attempts: 1, lastError: 'timeout' } })
    await setOrderStatus(o.id, 'CANCELLED')
    expect(await prisma.erpOutbox.findUnique({ where: { ref: `ZK-${o.id}` } })).toMatchObject({ status: 'PENDING' })
    expect(await prisma.erpOutbox.findUnique({ where: { ref: `ZK-${o.id}-R` } })).toMatchObject({ kind: 'RETURN' })
  })

  it('a FAILED DELIVER is not skipped on cancel either', async () => {
    process.env.ERP_ENABLED = '1'
    const o = await order([{ sku: 'R2', linked: true }])
    await setOrderStatus(o.id, 'CONFIRMED')
    await prisma.erpOutbox.update({ where: { ref: `ZK-${o.id}` }, data: { status: 'FAILED', attempts: 1 } })
    await setOrderStatus(o.id, 'CANCELLED')
    expect(await prisma.erpOutbox.findUnique({ where: { ref: `ZK-${o.id}-R` } })).toMatchObject({ kind: 'RETURN' })
  })

  it('only ERP-linked SKUs go into the push; an order with none queues nothing', async () => {
    process.env.ERP_ENABLED = '1'
    const o = await order([{ sku: 'L1x', linked: true }, { sku: 'U1x', linked: false }])
    await setOrderStatus(o.id, 'CONFIRMED')
    expect((await prisma.erpOutbox.findUnique({ where: { ref: `ZK-${o.id}` } }))!.lines).toEqual([{ sku: 'L1x', qty: 1, rateUzs: 500 }])
    const o2 = await order([{ sku: 'U2x', linked: false }])
    await setOrderStatus(o2.id, 'CONFIRMED')
    expect(await prisma.erpOutbox.findUnique({ where: { ref: `ZK-${o2.id}` } })).toBeNull()
  })

  it('cancel of an order confirmed AFTER the cutover while the flag was off pushes nothing (ERP never saw it)', async () => {
    await prisma.setting.create({ data: { key: 'erp.cutoverAt', value: new Date(Date.now() - 60_000).toISOString() } })
    delete process.env.ERP_ENABLED
    const o = await order([{ sku: 'C1x', linked: true }])
    await setOrderStatus(o.id, 'CONFIRMED')
    process.env.ERP_ENABLED = '1'
    expect(await setOrderStatus(o.id, 'CANCELLED')).toEqual({ ok: true })
    expect(await prisma.erpOutbox.count()).toBe(0)
  })

  it('cancel of an order confirmed BEFORE the cutover pushes a RECEIPT', async () => {
    delete process.env.ERP_ENABLED
    const o = await order([{ sku: 'C2x', linked: true }])
    await setOrderStatus(o.id, 'CONFIRMED')
    await prisma.setting.create({ data: { key: 'erp.cutoverAt', value: new Date(Date.now() + 1000).toISOString() } })
    process.env.ERP_ENABLED = '1'
    await setOrderStatus(o.id, 'CANCELLED')
    expect(await prisma.erpOutbox.findUnique({ where: { ref: `ZK-${o.id}-R` } })).toMatchObject({ kind: 'RECEIPT' })
  })
})
