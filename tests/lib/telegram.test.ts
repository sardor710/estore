import { describe, it, expect, vi } from 'vitest'
import { notifyNewOrder, notifyOrderPaid, type NotifyOrder } from '@/lib/telegram'
import { prisma } from '@/lib/db'
import { updateSettings } from '@/lib/settings'

const order: NotifyOrder = {
  number: 1001,
  name: 'Ali',
  phone: '+998901234567',
  region: 'Tashkent city',
  address: 'Amir Temur 1',
  comment: null,
  totalUzs: 1500000,
  lines: [{ productTitle: 'Charger', variantName: 'Black', qty: 2, priceUzs: 750000 }],
}

describe('notifyNewOrder', () => {
  it('skipped without config, no fetch', async () => {
    const f = vi.fn()
    expect(await notifyNewOrder(order, f as unknown as typeof fetch)).toBe('skipped')
    expect(f).not.toHaveBeenCalled()
  })
  it('skipped with only token', async () => {
    await updateSettings({ telegramBotToken: 'T' })
    const f = vi.fn()
    expect(await notifyNewOrder(order, f as unknown as typeof fetch)).toBe('skipped')
  })
  it('sent with mocked fetch', async () => {
    await updateSettings({ telegramBotToken: 'TOKEN', telegramChatId: '42' })
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    expect(await notifyNewOrder(order, f as unknown as typeof fetch)).toBe('sent')
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/botTOKEN/sendMessage')
    const body = JSON.parse(init.body)
    expect(body.chat_id).toBe('42')
    expect(body.text).toContain('1001')
    expect(body.text).toContain('Ali')
    expect(body.text).toContain('+998901234567')
    expect(body.text).toContain('Charger')
    expect(body.text).toContain('1 500 000')
  })
  it('failed on non-2xx', async () => {
    await updateSettings({ telegramBotToken: 'T', telegramChatId: '1' })
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    expect(await notifyNewOrder(order, f as unknown as typeof fetch)).toBe('failed')
  })
  it('failed (not thrown) on network error', async () => {
    await updateSettings({ telegramBotToken: 'T', telegramChatId: '1' })
    const f = vi.fn().mockRejectedValue(new Error('down'))
    expect(await notifyNewOrder(order, f as unknown as typeof fetch)).toBe('failed')
  })
})

describe('notifyNewOrder map link', () => {
  it('adds a Map line only when the order has a pin', async () => {
    await updateSettings({ telegramBotToken: 'TOKEN', telegramChatId: '42' })
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    await notifyNewOrder({ ...order, mapUrl: 'https://www.google.com/maps?q=41.311081,69.240562' }, f as unknown as typeof fetch)
    await notifyNewOrder(order, f as unknown as typeof fetch)
    expect(JSON.parse(f.mock.calls[0][1].body).text).toContain('Map: https://www.google.com/maps?q=41.311081,69.240562')
    expect(JSON.parse(f.mock.calls[1][1].body).text).not.toContain('Map:')
  })
})

describe('payment method in Telegram messages', () => {
  const sent = async (o: NotifyOrder) => {
    await updateSettings({ telegramBotToken: 'TOKEN', telegramChatId: '42' })
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    await notifyNewOrder(o, f as unknown as typeof fetch)
    return JSON.parse(f.mock.calls[0][1].body).text as string
  }
  it('new order says cash on delivery by default', async () => {
    expect(await sent(order)).toContain('Payment: cash on delivery')
  })
  it('new card order says awaiting card payment', async () => {
    expect(await sent({ ...order, payMethod: 'CARD' })).toContain('Payment: card (Octo), awaiting payment')
  })
  it('notifyOrderPaid sends number, amount and masked card', async () => {
    await updateSettings({ telegramBotToken: 'TOKEN', telegramChatId: '42' })
    const o = await prisma.order.create({
      data: {
        number: 1042, name: 'Ali', phone: '+998901234567', region: 'tashkent-city', address: 'A', locale: 'uz', totalUzs: 1_500_000,
        payMethod: 'CARD', paymentStatus: 'PAID',
        payments: { create: [{ shopTransactionId: 'zanko-1042-1', amountUzs: 1_500_000, status: 'succeeded', maskedPan: '418451** **** 1111', cardVendor: 'Visa' }] },
      },
    })
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    expect(await notifyOrderPaid(o.id, f as unknown as typeof fetch)).toBe('sent')
    const text = JSON.parse(f.mock.calls[0][1].body).text as string
    expect(text).toContain('Order #1042 paid by card')
    expect(text).toMatch(/1\s500\s000/)
    expect(text).toContain('Visa 418451** **** 1111')
  })
  it('notifyOrderPaid on an unknown order is skipped, no fetch', async () => {
    const f = vi.fn()
    expect(await notifyOrderPaid(999999, f as unknown as typeof fetch)).toBe('skipped')
    expect(f).not.toHaveBeenCalled()
  })
})
