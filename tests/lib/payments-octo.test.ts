import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { octoConfig, octoPrepare, octoStatus, octoRefund, OctoError } from '@/lib/payments/octo'

const saved = { ...process.env }
beforeEach(() => {
  process.env.OCTO_SHOP_ID = '43297'
  process.env.OCTO_SECRET = 'secret-xyz'
  process.env.OCTO_TEST = '1'
})
afterEach(() => {
  process.env = { ...saved }
})

type Call = { url: string; body: Record<string, unknown> }
function fakeFetch(response: unknown, calls: Call[] = []) {
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? '{}')) })
    return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
  return { f, calls }
}

const created = {
  error: 0,
  data: {
    shop_transaction_id: 'zanko-1001-1',
    octo_payment_UUID: 'uuid-1',
    status: 'created',
    octo_pay_url: 'https://pay2.octo.uz/pay/uuid-1?language=uz',
    total_sum: 1500000,
  },
}

describe('octoConfig', () => {
  it('reads shop id, secret and test flag from env', () => {
    expect(octoConfig()).toEqual({ shopId: 43297, secret: 'secret-xyz', test: true })
    process.env.OCTO_TEST = '0'
    expect(octoConfig()?.test).toBe(false)
  })
  it('is null when the shop id or the secret is missing', () => {
    delete process.env.OCTO_SECRET
    expect(octoConfig()).toBeNull()
    process.env.OCTO_SECRET = 'x'
    process.env.OCTO_SHOP_ID = ''
    expect(octoConfig()).toBeNull()
  })
})

describe('octoPrepare', () => {
  it('posts a one-stage UZS payment with credentials in the body', async () => {
    const { f, calls } = fakeFetch(created)
    const r = await octoPrepare(
      { shopTransactionId: 'zanko-1001-1', amountUzs: 1500000, description: 'Zanko order #1001', returnUrl: 'https://zanko.uz/uz/order/1001?t=a', notifyUrl: 'https://zanko.uz/api/payments/octo/notify', language: 'uz' },
      f,
    )
    expect(r).toEqual({ uuid: 'uuid-1', payUrl: 'https://pay2.octo.uz/pay/uuid-1?language=uz', status: 'created' })
    expect(calls[0].url).toBe('https://secure.octo.uz/prepare_payment')
    const b = calls[0].body
    expect(b).toMatchObject({
      octo_shop_id: 43297,
      octo_secret: 'secret-xyz',
      shop_transaction_id: 'zanko-1001-1',
      auto_capture: true,
      test: true,
      total_sum: 1500000,
      currency: 'UZS',
      description: 'Zanko order #1001',
      return_url: 'https://zanko.uz/uz/order/1001?t=a',
      notify_url: 'https://zanko.uz/api/payments/octo/notify',
      language: 'uz',
      ttl: 30,
    })
    expect(b.init_time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(b).not.toHaveProperty('payment_methods')
  })
  it('throws OctoError with the code and message on an error response', async () => {
    const { f } = fakeFetch({ error: 2, errMessage: 'Wrong secret', data: null })
    const err = await octoPrepare(
      { shopTransactionId: 'x', amountUzs: 1, description: 'd', returnUrl: 'r', notifyUrl: 'n', language: 'en' },
      f,
    ).catch((e) => e)
    expect(err).toBeInstanceOf(OctoError)
    expect(err.code).toBe(2)
    expect(err.message).toBe('Wrong secret')
  })
  it('throws when the config is missing, without calling Octo', async () => {
    delete process.env.OCTO_SECRET
    const { f, calls } = fakeFetch(created)
    await expect(octoPrepare({ shopTransactionId: 'x', amountUzs: 1, description: 'd', returnUrl: 'r', notifyUrl: 'n', language: 'en' }, f)).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })
})

describe('octoStatus', () => {
  it('asks by shop_transaction_id and returns status, amount and card', async () => {
    const { f, calls } = fakeFetch({
      error: 0,
      data: { shop_transaction_id: 'zanko-1001-1', octo_payment_UUID: 'uuid-1', status: 'succeeded', total_sum: 1500000, maskedPan: '860049** **** 1234', card_vendor: 'Uzcard', payed_time: '2026-11-26 15:00:00' },
    })
    const s = await octoStatus('zanko-1001-1', f)
    expect(calls[0].body).toEqual({ octo_shop_id: 43297, octo_secret: 'secret-xyz', shop_transaction_id: 'zanko-1001-1' })
    expect(s).toEqual({ uuid: 'uuid-1', status: 'succeeded', totalSum: 1500000, maskedPan: '860049** **** 1234', cardVendor: 'Uzcard', payedTime: '2026-11-26 15:00:00' })
  })
  it('falls back to top-level fields', async () => {
    const { f } = fakeFetch({ error: 0, octo_payment_UUID: 'uuid-2', status: 'canceled', total_sum: 5 })
    expect(await octoStatus('t', f)).toMatchObject({ uuid: 'uuid-2', status: 'canceled', totalSum: 5 })
  })
})

describe('octoRefund', () => {
  it('posts a full refund and returns its status', async () => {
    const { f, calls } = fakeFetch({ error: 0, data: { octo_payment_UUID: 'uuid-1', refund_id: 'zanko-r-1001', status: 'succeeded' } })
    const r = await octoRefund({ uuid: 'uuid-1', refundId: 'zanko-r-1001', amountUzs: 1500000 }, f)
    expect(calls[0].url).toBe('https://secure.octo.uz/refund')
    expect(calls[0].body).toEqual({ octo_shop_id: 43297, octo_secret: 'secret-xyz', shop_refund_id: 'zanko-r-1001', octo_payment_UUID: 'uuid-1', amount: 1500000 })
    expect(r).toEqual({ refundId: 'zanko-r-1001', status: 'succeeded' })
  })
})
