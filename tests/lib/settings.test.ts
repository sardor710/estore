import { describe, it, expect } from 'vitest'
import { getSettings, updateSettings } from '@/lib/settings'

describe('settings', () => {
  it('returns defaults', async () => {
    expect(await getSettings()).toEqual({
      minOrderUzs: 0,
      telegramBotToken: null,
      telegramChatId: null,
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
  it('is reset between tests', async () => {
    expect((await getSettings()).minOrderUzs).toBe(0)
  })
})
