import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { startCardPayment, settlePayment, settleOrder, refundOrder } from '@/lib/payments/service'

const saved = { ...process.env }
beforeEach(() => {
  process.env.OCTO_SHOP_ID = '43297'
  process.env.OCTO_SECRET = 'secret-xyz'
  process.env.OCTO_TEST = '1'
})
afterEach(() => {
  process.env = { ...saved }
  vi.restoreAllMocks()
})

let num = 1000
async function mkOrder(extra: Record<string, unknown> = {}) {
  return prisma.order.create({
    data: {
      number: ++num, name: 'Ali', phone: '+998901234567', region: 'tashkent-city', address: 'A 1', locale: 'uz',
      totalUzs: 1_500_000, payMethod: 'CARD', paymentStatus: 'PENDING', payToken: `tok-${num}`, ...extra,
    },
  })
}

/** Fake Octo: prepare_payment with total_sum creates; without it answers the status for that shop_transaction_id. */
function octo(opts: { status?: (tx: string) => Record<string, unknown>; refund?: Record<string, unknown> } = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const f = (async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    calls.push({ url, body })
    let data: Record<string, unknown>
    if (url.endsWith('/refund')) data = opts.refund ?? { status: 'succeeded', refund_id: body.shop_refund_id }
    else if ('total_sum' in body) data = { octo_payment_UUID: `uuid-${body.shop_transaction_id}`, status: 'created', octo_pay_url: `https://pay2.octo.uz/pay/uuid-${body.shop_transaction_id}` }
    else data = { octo_payment_UUID: `uuid-${body.shop_transaction_id}`, ...(opts.status?.(String(body.shop_transaction_id)) ?? { status: 'created', total_sum: 1_500_000 }) }
    return new Response(JSON.stringify({ error: 0, data }), { status: 200 })
  }) as unknown as typeof fetch
  return { f, calls }
}
const paid = (sum = 1_500_000) => () => ({ status: 'succeeded', total_sum: sum, maskedPan: '860049** **** 1234', card_vendor: 'Uzcard', payed_time: '2026-11-26 15:00:00' })

describe('startCardPayment', () => {
  it('creates attempt zanko-<number>-1 and returns the Octo link', async () => {
    const o = await mkOrder()
    const { f, calls } = octo()
    const r = await startCardPayment(o.id, { fetch: f })
    expect(r.payUrl).toBe(`https://pay2.octo.uz/pay/uuid-zanko-${o.number}-1`)
    const body = calls[0].body
    expect(body.shop_transaction_id).toBe(`zanko-${o.number}-1`)
    expect(body.total_sum).toBe(1_500_000)
    expect(body.description).toBe(`Zanko order #${o.number}`)
    expect(body.language).toBe('uz')
    expect(String(body.return_url)).toMatch(new RegExp(`/uz/order/${o.number}\\?t=tok-${o.number}$`))
    expect(String(body.notify_url)).toMatch(/\/api\/payments\/octo\/notify$/)
    const pay = await prisma.payment.findUniqueOrThrow({ where: { shopTransactionId: `zanko-${o.number}-1` } })
    expect(pay).toMatchObject({ orderId: o.id, amountUzs: 1_500_000, octoPaymentId: `uuid-zanko-${o.number}-1`, status: 'created' })
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } })
    expect(after).toMatchObject({ paymentStatus: 'PENDING', paymentProvider: 'octo' })
  })
  it('numbers further attempts and refuses a paid order', async () => {
    const o = await mkOrder()
    const { f } = octo()
    await startCardPayment(o.id, { fetch: f })
    await startCardPayment(o.id, { fetch: f })
    expect(await prisma.payment.count({ where: { orderId: o.id } })).toBe(2)
    await prisma.order.update({ where: { id: o.id }, data: { paymentStatus: 'PAID' } })
    await expect(startCardPayment(o.id, { fetch: f })).rejects.toThrow('ALREADY_PAID')
  })
  it('stops after 10 attempts', async () => {
    const o = await mkOrder()
    const { f } = octo()
    for (let i = 0; i < 10; i++) await startCardPayment(o.id, { fetch: f })
    await expect(startCardPayment(o.id, { fetch: f })).rejects.toThrow('TOO_MANY_ATTEMPTS')
  })
})

describe('settlePayment', () => {
  it('marks the order PAID only after Octo says succeeded with the same amount', async () => {
    const o = await mkOrder()
    await startCardPayment(o.id, { fetch: octo().f })
    const notifyPaid = vi.fn()
    expect(await settlePayment(`zanko-${o.number}-1`, { fetch: octo({ status: paid() }).f, notifyPaid })).toBe('PAID')
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { payments: true } })
    expect(after.paymentStatus).toBe('PAID')
    expect(after.payments[0]).toMatchObject({ status: 'succeeded', maskedPan: '860049** **** 1234', cardVendor: 'Uzcard' })
    expect(after.payments[0].paidAt).toBeInstanceOf(Date)
    expect(notifyPaid).toHaveBeenCalledWith(o.id)
  })
  it('keeps PENDING while Octo still says created', async () => {
    const o = await mkOrder()
    await startCardPayment(o.id, { fetch: octo().f })
    expect(await settlePayment(`zanko-${o.number}-1`, { fetch: octo().f })).toBe('PENDING')
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe('PENDING')
  })
  it('never marks PAID when Octo reports a different amount', async () => {
    const o = await mkOrder()
    await startCardPayment(o.id, { fetch: octo().f })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await settlePayment(`zanko-${o.number}-1`, { fetch: octo({ status: paid(1000) }).f })).toBe('PENDING')
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe('PENDING')
  })
  it('notifies exactly once when two settles race', async () => {
    const o = await mkOrder()
    await startCardPayment(o.id, { fetch: octo().f })
    const notifyPaid = vi.fn()
    const f = octo({ status: paid() }).f
    const r = await Promise.all([settlePayment(`zanko-${o.number}-1`, { fetch: f, notifyPaid }), settlePayment(`zanko-${o.number}-1`, { fetch: f, notifyPaid })])
    expect(r).toEqual(['PAID', 'PAID'])
    expect(notifyPaid).toHaveBeenCalledTimes(1)
  })
  it('canceled attempt -> order FAILED', async () => {
    const o = await mkOrder()
    await startCardPayment(o.id, { fetch: octo().f })
    expect(await settlePayment(`zanko-${o.number}-1`, { fetch: octo({ status: () => ({ status: 'canceled', total_sum: 1_500_000 }) }).f })).toBe('FAILED')
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe('FAILED')
  })
  it('a late cancel of attempt 2 does not undo a paid attempt 1', async () => {
    const o = await mkOrder()
    await startCardPayment(o.id, { fetch: octo().f })
    await startCardPayment(o.id, { fetch: octo().f })
    const f = octo({ status: (tx) => (tx.endsWith('-1') ? paid()() : { status: 'canceled', total_sum: 1_500_000 }) }).f
    expect(await settlePayment(`zanko-${o.number}-1`, { fetch: f })).toBe('PAID')
    await settlePayment(`zanko-${o.number}-2`, { fetch: f })
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe('PAID')
    await expect(startCardPayment(o.id, { fetch: f })).rejects.toThrow('ALREADY_PAID')
  })
  it('unknown shop_transaction_id -> UNKNOWN without calling Octo', async () => {
    const { f, calls } = octo({ status: paid() })
    expect(await settlePayment('zanko-999999-1', { fetch: f })).toBe('UNKNOWN')
    expect(calls).toHaveLength(0)
  })
})

describe('settleOrder', () => {
  it('settles the open attempts of a pending order', async () => {
    const o = await mkOrder()
    await startCardPayment(o.id, { fetch: octo().f })
    await settleOrder(o.id, { fetch: octo({ status: paid() }).f })
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).paymentStatus).toBe('PAID')
  })
})

describe('refundOrder', () => {
  async function paidOrder() {
    const o = await mkOrder()
    await startCardPayment(o.id, { fetch: octo().f })
    await settlePayment(`zanko-${o.number}-1`, { fetch: octo({ status: paid() }).f })
    return o
  }
  it('refunds the full amount and marks REFUNDED', async () => {
    const o = await paidOrder()
    const { f, calls } = octo()
    expect(await refundOrder(o.id, { fetch: f })).toEqual({ status: 'REFUNDED' })
    expect(calls[0].body).toMatchObject({ octo_payment_UUID: `uuid-zanko-${o.number}-1`, amount: 1_500_000, shop_refund_id: `zanko-r-${o.number}` })
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { payments: true } })
    expect(after.paymentStatus).toBe('REFUNDED')
    expect(after.payments[0]).toMatchObject({ refundedUzs: 1_500_000, refundId: `zanko-r-${o.number}` })
  })
  it('pending refund keeps the order PAID and records the refund id', async () => {
    const o = await paidOrder()
    expect(await refundOrder(o.id, { fetch: octo({ refund: { status: 'pending', refund_id: 'r-1' } }).f })).toEqual({ status: 'REFUND_PENDING' })
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { payments: true } })
    expect(after.paymentStatus).toBe('PAID')
    expect(after.payments[0].refundId).toBe('r-1')
  })
  it('refuses an unpaid order without calling Octo', async () => {
    const o = await mkOrder()
    const { f, calls } = octo()
    await expect(refundOrder(o.id, { fetch: f })).rejects.toThrow('NOT_PAID')
    expect(calls).toHaveLength(0)
  })
})
