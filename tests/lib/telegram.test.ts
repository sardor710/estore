import { describe, it, expect, vi } from 'vitest'
import { notifyNewOrder, type NotifyOrder } from '@/lib/telegram'
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
