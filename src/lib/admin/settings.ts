import { getSettings, updateSettings, SHOP_DETAIL_KEYS, type ShopDetails } from '@/lib/settings'
import { sendTelegramText, type NotifyResult } from '@/lib/telegram'

/** Shows only the first and last 4 characters of a token; never the whole thing. */
export function maskToken(token: string | null): string {
  if (!token) return ''
  if (token.length <= 10) return '****'
  return `${token.slice(0, 4)}...${token.slice(-4)}`
}

export type BusinessSettingsView = { minOrderUzs: number; vipThresholdUzs: number; lowStockThreshold: number; shop: Record<keyof ShopDetails, string> }
export type IntegrationSettingsView = { telegramTokenMasked: string; telegramTokenSet: boolean; telegramChatId: string }
/** Integration fields are only present for staff allowed to see them ('settings.integrations'). */
export type SettingsView = BusinessSettingsView & ({ integrations: true } & IntegrationSettingsView | { integrations: false })

export async function getSettingsView(opts: { integrations: boolean }): Promise<SettingsView> {
  const s = await getSettings()
  const shop = Object.fromEntries(SHOP_DETAIL_KEYS.map((k) => [k, s[k] ?? ''])) as Record<keyof ShopDetails, string>
  const business = { minOrderUzs: s.minOrderUzs, vipThresholdUzs: s.vipThresholdUzs, lowStockThreshold: s.lowStockThreshold, shop }
  if (!opts.integrations) return { ...business, integrations: false }
  return {
    ...business,
    integrations: true,
    telegramTokenMasked: maskToken(s.telegramBotToken),
    telegramTokenSet: Boolean(s.telegramBotToken),
    telegramChatId: s.telegramChatId ?? '',
  }
}

export type SettingsInput = {
  // Business ('settings.business'). minOrderUzs is required; the other two keep the stored value when omitted.
  minOrderUzs: number
  vipThresholdUzs?: number
  lowStockThreshold?: number
  /** Seller details; omitted = unchanged, empty string = remove. */
  shop?: Partial<Record<keyof ShopDetails, string>>
  // Integrations ('settings.integrations'). Omitted = unchanged.
  /** undefined / empty keeps the stored token; a new value replaces it. */
  telegramBotToken?: string
  clearTelegramToken?: boolean
  telegramChatId?: string
}

export const INTEGRATIONS_DENIED = 'You do not have permission to change integration settings.'

const isWholeAtLeast = (n: unknown, min: number) => typeof n === 'number' && Number.isInteger(n) && n >= min

/**
 * Validates and saves. Each field is checked against the caller's rights: integration fields from a caller
 * without `integrations` are refused (never silently applied), even if the form normally hides them.
 */
export async function saveSettings(
  input: SettingsInput,
  opts: { integrations: boolean },
): Promise<{ ok: true; changed: string[] } | { ok: false; errors: Record<string, string> }> {
  const touchesIntegrations =
    input.telegramBotToken !== undefined || input.clearTelegramToken !== undefined || input.telegramChatId !== undefined
  if (touchesIntegrations && !opts.integrations) return { ok: false, errors: { _: INTEGRATIONS_DENIED } }

  const errors: Record<string, string> = {}
  if (!isWholeAtLeast(input.minOrderUzs, 0)) errors.minOrderUzs = 'Minimum order must be a whole number >= 0.'
  if (input.vipThresholdUzs !== undefined && !isWholeAtLeast(input.vipThresholdUzs, 1)) errors.vipThresholdUzs = 'VIP threshold must be a whole number >= 1.'
  if (input.lowStockThreshold !== undefined && !isWholeAtLeast(input.lowStockThreshold, 0)) errors.lowStockThreshold = 'Low-stock threshold must be a whole number >= 0.'
  const token = (input.telegramBotToken ?? '').trim()
  if (token && !/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) errors.telegramBotToken = 'That does not look like a Telegram bot token (digits, a colon, then letters).'
  const chat = (input.telegramChatId ?? '').trim()
  if (chat && !/^-?\d+$|^@[A-Za-z0-9_]{4,}$/.test(chat)) errors.telegramChatId = 'Chat id is a number (e.g. -1001234567890) or @channelname.'
  const shop: Partial<Record<keyof ShopDetails, string | null>> = {}
  for (const k of SHOP_DETAIL_KEYS) {
    const raw = input.shop?.[k]
    if (raw === undefined) continue
    if (typeof raw !== 'string') {
      errors[k] = 'Invalid value.'
      continue
    }
    const v = raw.trim()
    if (v.length > (k === 'shopAddress' ? 300 : 150)) errors[k] = 'Too long.'
    else if (v && k === 'shopEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors[k] = 'Enter a valid email address.'
    else if (v && k === 'shopPhone' && !/^\+?[\d\s()-]{7,20}$/.test(v)) errors[k] = 'Enter a phone number, e.g. +998 90 123-45-67.'
    else if (v && k === 'shopInn' && !/^\d{9}$|^\d{14}$/.test(v)) errors[k] = 'INN (STIR) is 9 digits (or a 14-digit PINFL for an individual entrepreneur).'
    else if (v && k === 'shopTelegram' && !/^@[A-Za-z0-9_]{4,32}$/.test(v)) errors[k] = 'Telegram username like @zanko_support.'
    shop[k] = v || null
  }
  if (Object.keys(errors).length) return { ok: false, errors }

  const before = await getSettings()
  await updateSettings({
    minOrderUzs: input.minOrderUzs,
    vipThresholdUzs: input.vipThresholdUzs,
    lowStockThreshold: input.lowStockThreshold,
    ...shop,
    ...(input.telegramChatId !== undefined ? { telegramChatId: chat || null } : {}),
    ...(input.clearTelegramToken ? { telegramBotToken: null } : token ? { telegramBotToken: token } : {}),
  })
  const after = await getSettings()
  // Names only (never values) so the activity log cannot leak a token.
  const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => after[k] !== before[k])
  return { ok: true, changed }
}

export async function sendTestMessage(fetchImpl?: typeof fetch): Promise<NotifyResult> {
  return sendTelegramText('Test message from the store admin panel. Order notifications are working.', fetchImpl)
}
