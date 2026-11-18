import { describe, it, expect } from 'vitest'
import { getSettings, updateSettings } from '@/lib/settings'

describe('settings', () => {
  it('returns defaults', async () => {
    expect(await getSettings()).toEqual({
      minOrderUzs: 0,
      telegramBotToken: null,
      telegramChatId: null,
      vipThresholdUzs: 10_000_000,
      lowStockThreshold: 3,
      shopLegalName: null,
      shopInn: null,
      shopAddress: null,
      shopPhone: null,
      shopEmail: null,
      shopTelegram: null,
      shopHours: null,
    })
  })
  it('persists updates', async () => {
    await updateSettings({ minOrderUzs: 500000, telegramChatId: '123' })
    const s = await getSettings()
    expect(s.minOrderUzs).toBe(500000)
    expect(s.telegramChatId).toBe('123')
    expect(s.telegramBotToken).toBeNull()
    await updateSettings({ telegramChatId: null })
    expect((await getSettings()).telegramChatId).toBeNull()
  })
  it('round-trips vip and low-stock thresholds', async () => {
    await updateSettings({ vipThresholdUzs: 5_000_000, lowStockThreshold: 7 })
    const s = await getSettings()
    expect(s.vipThresholdUzs).toBe(5_000_000)
    expect(s.lowStockThreshold).toBe(7)
  })
  it('is reset between tests', async () => {
    expect((await getSettings()).minOrderUzs).toBe(0)
    expect((await getSettings()).vipThresholdUzs).toBe(10_000_000)
  })
})
