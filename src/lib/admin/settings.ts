import { getSettings, updateSettings } from '@/lib/settings'
import { sendTelegramText, type NotifyResult } from '@/lib/telegram'

/** Shows only the first and last 4 characters of a token; never the whole thing. */
export function maskToken(token: string | null): string {
  if (!token) return ''
  if (token.length <= 10) return '****'
  return `${token.slice(0, 4)}...${token.slice(-4)}`
}

export type SettingsView = { minOrderUzs: number; telegramTokenMasked: string; telegramTokenSet: boolean; telegramChatId: string }

export async function getSettingsView(): Promise<SettingsView> {
  const s = await getSettings()
  return {
    minOrderUzs: s.minOrderUzs,
    telegramTokenMasked: maskToken(s.telegramBotToken),
    telegramTokenSet: Boolean(s.telegramBotToken),
    telegramChatId: s.telegramChatId ?? '',
  }
}

export type SettingsInput = {
  minOrderUzs: number
  /** undefined / empty keeps the stored token; a new value replaces it. */
  telegramBotToken?: string
  clearTelegramToken?: boolean
  telegramChatId: string
}

export async function saveSettings(input: SettingsInput): Promise<{ ok: true } | { ok: false; errors: Record<string, string> }> {
  const errors: Record<string, string> = {}
  if (!Number.isInteger(input.minOrderUzs) || input.minOrderUzs < 0) errors.minOrderUzs = 'Minimum order must be a whole number >= 0.'
  const token = (input.telegramBotToken ?? '').trim()
  if (token && !/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) errors.telegramBotToken = 'That does not look like a Telegram bot token (digits, a colon, then letters).'
  const chat = (input.telegramChatId ?? '').trim()
  if (chat && !/^-?\d+$|^@[A-Za-z0-9_]{4,}$/.test(chat)) errors.telegramChatId = 'Chat id is a number (e.g. -1001234567890) or @channelname.'
  if (Object.keys(errors).length) return { ok: false, errors }
  await updateSettings({
    minOrderUzs: input.minOrderUzs,
    telegramChatId: chat || null,
    ...(input.clearTelegramToken ? { telegramBotToken: null } : token ? { telegramBotToken: token } : {}),
  })
  return { ok: true }
}

export async function sendTestMessage(fetchImpl?: typeof fetch): Promise<NotifyResult> {
  return sendTelegramText('Test message from the store admin panel. Order notifications are working.', fetchImpl)
}
