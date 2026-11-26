import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/db'
import { orderPaymentView } from '@/lib/payments/view'

const saved = { ...process.env }
beforeEach(() => {
  process.env.OCTO_SHOP_ID = '43297'
  process.env.OCTO_SECRET = 'secret-xyz'
})
afterEach(() => {
  process.env = { ...saved }
})

const statusFetch = (data: Record<string, unknown>) => {
  const calls: string[] = []
  const f = (async (url: string) => {
    calls.push(url)
    return new Response(JSON.stringify({ error: 0, data }))
  }) as unknown as typeof fetch
  return { f, calls }
}

async function mk(paymentStatus = 'PENDING', payMethod = 'CARD') {
  return prisma.order.create({
    data: {
      number: 2001, name: 'A', phone: '+998901234567', region: 'tashkent-city', address: 'A', locale: 'uz', totalUzs: 500_000,
      payMethod, paymentStatus, payToken: payMethod === 'CARD' ? 't'.repeat(32) : null,
      payments: payMethod === 'CARD' ? { create: [{ shopTransactionId: 'zanko-2001-1', amountUzs: 500_000, status: 'created' }] } : undefined,
    },
  })
}

describe('orderPaymentView', () => {
  it('null without the right token, and never asks Octo', async () => {
    await mk()
    const { f, calls } = statusFetch({ status: 'succeeded', total_sum: 500_000 })
    expect(await orderPaymentView(2001, null, { fetch: f })).toBeNull()
    expect(await orderPaymentView(2001, 'x'.repeat(32), { fetch: f })).toBeNull()
    expect(calls).toHaveLength(0)
  })
  it('null for a cash order even when trusted', async () => {
    await mk('UNPAID', 'CASH')
    expect(await orderPaymentView(2001, null, { trusted: true })).toBeNull()
  })
  it('a pending order is settled with Octo first, then shown as PAID with the card', async () => {
    await mk()
    const { f } = statusFetch({ status: 'succeeded', total_sum: 500_000, maskedPan: '986012** **** 0000', card_vendor: 'Humo' })
    expect(await orderPaymentView(2001, 't'.repeat(32), { fetch: f })).toEqual({
      number: 2001, token: 't'.repeat(32), status: 'PAID', totalUzs: 500_000, cardVendor: 'Humo', maskedPan: '986012** **** 0000',
    })
  })
  it('stays PENDING while Octo says created; trusted view needs no token', async () => {
    await mk()
    const { f } = statusFetch({ status: 'created', total_sum: 500_000 })
    expect(await orderPaymentView(2001, null, { trusted: true, fetch: f })).toMatchObject({ status: 'PENDING', cardVendor: null, maskedPan: null })
  })
})
