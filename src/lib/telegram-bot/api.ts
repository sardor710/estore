// Customer-facing Telegram Bot API calls (the staff order alert stays in src/lib/telegram.ts).
// Shared by the bot update handler (M2), the code-login route and status notifications (M3).
import { prisma } from '@/lib/db'
import { getSettings } from '@/lib/settings'

/** One of: `url` (opens a browser), `webApp` (opens the Mini App inside Telegram; https only), `data` (callback). */
export type InlineButton = { text: string; url?: string; webApp?: string; data?: string }

export type BotResult<T> = { ok: true; result: T } | { ok: false; error: string }

/**
 * Calls a Bot API method with the bot token from Settings, keeping Telegram's error description (admin feedback).
 * Never throws.
 */
export async function botCallResult<T = unknown>(method: string, body: object, fetchImpl: typeof fetch = fetch): Promise<BotResult<T>> {
  try {
    const { telegramBotToken } = await getSettings()
    if (!telegramBotToken) return { ok: false, error: 'No bot token saved in Settings.' }
    const res = await fetchImpl(`https://api.telegram.org/bot${telegramBotToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(method === 'getUpdates' ? 65_000 : 8000),
    })
    const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null
    if (res.ok && json?.ok) return { ok: true, result: json.result as T }
    return { ok: false, error: json?.description || `Telegram answered HTTP ${res.status}.` }
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === 'TimeoutError' ? 'Telegram did not answer in time.' : 'Telegram is unreachable.' }
  }
}

/** Calls a Bot API method with the bot token from Settings. Never throws; null when unconfigured, on HTTP/API error or timeout. */
export async function botCall<T = unknown>(method: string, body: object, fetchImpl: typeof fetch = fetch): Promise<T | null> {
  const r = await botCallResult<T>(method, body, fetchImpl)
  return r.ok ? r.result : null
}

const USERNAME_KEY = 'telegramBotUsername'

/** The bot's @username (without @) for t.me deep links; read once via getMe and cached in Settings (keyed to the token). */
export async function getBotUsername(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const { telegramBotToken } = await getSettings()
  if (!telegramBotToken) return null
  const tokenTag = telegramBotToken.split(':')[0] // bot id: cache stays valid until the token changes to another bot
  const cached = await prisma.setting.findUnique({ where: { key: USERNAME_KEY } })
  if (cached) {
    const [tag, name] = cached.value.split('|')
    if (tag === tokenTag && name) return name
  }
  const me = await botCall<{ username?: string }>('getMe', {}, fetchImpl)
  if (!me?.username) return null
  const value = `${tokenTag}|${me.username}`
  await prisma.setting.upsert({ where: { key: USERNAME_KEY }, update: { value }, create: { key: USERNAME_KEY, value } })
  return me.username
}

/** Sends a plain-text message to a customer's chat. `buttons`: rows of inline buttons (url or callback data). Never throws. */
export async function sendCustomerMessage(
  chatId: string,
  text: string,
  opts: { buttons?: InlineButton[][] } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const reply_markup = opts.buttons?.length ? inlineKeyboard(opts.buttons) : undefined
  return sendBotMessage(chatId, text, reply_markup, fetchImpl)
}

// ---------- lower-level helpers for the update handler ----------

export type ReplyMarkup =
  | { inline_keyboard: ({ text: string; url: string } | { text: string; web_app: { url: string } } | { text: string; callback_data: string })[][] }
  | { keyboard: { text: string; request_contact?: boolean }[][]; one_time_keyboard?: boolean; resize_keyboard?: boolean }
  | { remove_keyboard: true }

export function inlineKeyboard(buttons: InlineButton[][]): ReplyMarkup {
  return {
    inline_keyboard: buttons.map((row) =>
      row.map((b) =>
        b.webApp ? { text: b.text, web_app: { url: b.webApp } } : b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data ?? '' },
      ),
    ),
  }
}

/** One-button reply keyboard that shares the user's own phone contact (Telegram's request_contact). */
export function contactKeyboard(label: string): ReplyMarkup {
  return { keyboard: [[{ text: label, request_contact: true }]], one_time_keyboard: true, resize_keyboard: true }
}

export const REMOVE_KEYBOARD: ReplyMarkup = { remove_keyboard: true }

/** sendMessage with any reply markup (inline buttons, reply keyboard, remove_keyboard). Never throws. */
export async function sendBotMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: ReplyMarkup,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const r = await botCall('sendMessage', { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }, fetchImpl)
  return r !== null
}

/** Replaces a bot message's text; its inline buttons are dropped unless new inline `replyMarkup` is given. Never throws. */
export async function editBotMessage(
  chatId: string | number,
  messageId: number,
  text: string,
  fetchImpl: typeof fetch = fetch,
  replyMarkup?: ReplyMarkup,
): Promise<boolean> {
  const r = await botCall('editMessageText', { chat_id: chatId, message_id: messageId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }, fetchImpl)
  return r !== null
}

/** Stops the button's loading spinner, with an optional toast (or alert) text. Never throws. */
export async function answerCallbackQuery(
  id: string,
  text?: string,
  opts: { alert?: boolean } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const r = await botCall('answerCallbackQuery', { callback_query_id: id, ...(text ? { text, show_alert: !!opts.alert } : {}) }, fetchImpl)
  return r !== null
}

// ---------- media (admin -> customer posts) ----------

export type BotMediaKind = 'photo' | 'animation' | 'video'
/** A local file to upload, or a file_id Telegram returned for an earlier upload (re-sending costs no upload). */
export type BotMediaSource = { fileId: string } | { data: Uint8Array; filename: string; contentType: string }

const MEDIA_METHOD: Record<BotMediaKind, string> = { photo: 'sendPhoto', animation: 'sendAnimation', video: 'sendVideo' }

/**
 * sendPhoto / sendAnimation / sendVideo with an optional plain-text caption (max 1024 chars). Never throws.
 * Returns the file_id to reuse for the next recipient, or null on failure.
 */
export async function sendBotMedia(
  chatId: string | number,
  kind: BotMediaKind,
  source: BotMediaSource,
  caption: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ fileId: string | null } | null> {
  try {
    const { telegramBotToken } = await getSettings()
    if (!telegramBotToken) return null
    const form = new FormData()
    form.set('chat_id', String(chatId))
    if (caption) form.set('caption', caption)
    if (kind === 'video') form.set('supports_streaming', 'true')
    if ('fileId' in source) form.set(kind, source.fileId)
    else form.set(kind, new Blob([source.data as Uint8Array<ArrayBuffer>], { type: source.contentType }), source.filename)
    const res = await fetchImpl(`https://api.telegram.org/bot${telegramBotToken}/${MEDIA_METHOD[kind]}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout('fileId' in source ? 15_000 : 180_000),
    })
    const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: Record<string, unknown> } | null
    if (!res.ok || !json?.ok) return null
    return { fileId: mediaFileId(kind, json.result) }
  } catch {
    return null
  }
}

/** file_id of the sent media in a Message (largest photo size; a GIF may come back as animation or document). */
function mediaFileId(kind: BotMediaKind, msg: Record<string, unknown> | undefined): string | null {
  if (!msg) return null
  const id = (v: unknown) => (v && typeof v === 'object' && typeof (v as { file_id?: unknown }).file_id === 'string' ? (v as { file_id: string }).file_id : null)
  if (kind === 'photo') {
    const sizes = Array.isArray(msg.photo) ? msg.photo : []
    return id(sizes[sizes.length - 1])
  }
  if (kind === 'video') return id(msg.video) ?? id(msg.document)
  return id(msg.animation) ?? id(msg.document)
}
