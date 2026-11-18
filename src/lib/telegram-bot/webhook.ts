// Telegram webhook registration + authentication of incoming webhook calls.
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { safeEqual } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { botCallResult, getBotUsername } from './api'
import { isHttpsUrl, tgLaunchUrl } from '@/lib/tg/next'

export const WEBHOOK_SECRET_KEY = 'telegramWebhookSecret'
export const WEBHOOK_PATH = '/api/telegram/webhook'
export const SECRET_HEADER = 'x-telegram-bot-api-secret-token'

/** True only when a secret is configured and the header matches it (constant-time). */
export async function isValidWebhookSecret(header: string | null | undefined): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key: WEBHOOK_SECRET_KEY } })
  if (!row?.value || !header) return false
  return safeEqual(header, row.value)
}

/** The stored secret, created (32 random bytes, hex) on first use. */
export async function ensureWebhookSecret(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: WEBHOOK_SECRET_KEY } })
  if (row?.value && /^[0-9a-f]{64}$/.test(row.value)) return row.value
  const value = randomBytes(32).toString('hex')
  await prisma.setting.upsert({ where: { key: WEBHOOK_SECRET_KEY }, update: { value }, create: { key: WEBHOOK_SECRET_KEY, value } })
  return value
}

/** `${SITE_URL}/api/telegram/webhook` when SITE_URL is a valid https URL (Telegram only calls https), else null. */
export function webhookUrl(siteUrl: string | undefined = process.env.SITE_URL): string | null {
  const raw = (siteUrl ?? '').trim()
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return null
  } catch {
    return null
  }
  return `${raw.replace(/\/+$/, '')}${WEBHOOK_PATH}`
}

export type ConnectResult = { ok: true; username: string | null; url: string; warnings: string[] } | { ok: false; error: string }

const COMMANDS: Record<'uz' | 'ru' | 'en', { command: string; description: string }[]> = {
  uz: [
    { command: 'start', description: 'Do‘konni ochish' },
    { command: 'orders', description: 'Mening buyurtmalarim' },
    { command: 'notifications', description: 'Buyurtma xabarlari' },
    { command: 'language', description: 'Bot tili' },
    { command: 'account', description: 'Bogʻlangan akkaunt' },
    { command: 'logout', description: 'Barcha qurilmalardan chiqish' },
    { command: 'help', description: 'Yordam' },
  ],
  ru: [
    { command: 'start', description: 'Открыть магазин' },
    { command: 'orders', description: 'Мои заказы' },
    { command: 'notifications', description: 'Уведомления о заказах' },
    { command: 'language', description: 'Язык бота' },
    { command: 'account', description: 'Привязанный аккаунт' },
    { command: 'logout', description: 'Выйти на всех устройствах' },
    { command: 'help', description: 'Помощь' },
  ],
  en: [
    { command: 'start', description: 'Open the shop' },
    { command: 'orders', description: 'My orders' },
    { command: 'notifications', description: 'Order updates' },
    { command: 'language', description: 'Bot language' },
    { command: 'account', description: 'Linked account' },
    { command: 'logout', description: 'Sign out on all devices' },
    { command: 'help', description: 'Help' },
  ],
}

/** Mini App menu button (next to the message field) + command list; failures are warnings, never fail the connect. */
async function setupMiniApp(fetchImpl: typeof fetch): Promise<string[]> {
  const warnings: string[] = []
  const launch = tgLaunchUrl('/uz')
  if (isHttpsUrl(launch)) {
    const r = await botCallResult('setChatMenuButton', { menu_button: { type: 'web_app', text: '🛍 Shop', web_app: { url: launch } } }, fetchImpl)
    if (!r.ok) warnings.push(`Menu button: ${r.error}`)
  }
  for (const [lang, commands] of [[null, COMMANDS.uz], ['ru', COMMANDS.ru], ['en', COMMANDS.en]] as const) {
    const r = await botCallResult('setMyCommands', { commands, ...(lang ? { language_code: lang } : {}) }, fetchImpl)
    if (!r.ok) warnings.push(`Commands (${lang ?? 'default'}): ${r.error}`)
  }
  return warnings
}

/** Registers the webhook with Telegram (secret token, only message + callback_query updates). Never throws. */
export async function connectBotWebhook(fetchImpl: typeof fetch = fetch): Promise<ConnectResult> {
  const url = webhookUrl()
  if (!url) return { ok: false, error: 'SITE_URL must be an https URL reachable by Telegram' }
  const { telegramBotToken } = await getSettings()
  if (!telegramBotToken) return { ok: false, error: 'Save a bot token first.' }
  const secret = await ensureWebhookSecret()
  const r = await botCallResult(
    'setWebhook',
    { url, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true },
    fetchImpl,
  )
  if (!r.ok) return { ok: false, error: `Telegram refused the webhook: ${r.error}` }
  const warnings = await setupMiniApp(fetchImpl)
  return { ok: true, username: await getBotUsername(fetchImpl), url, warnings }
}
