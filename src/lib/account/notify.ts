import { prisma } from '@/lib/db'
import { sendCustomerMessage, type InlineButton } from '@/lib/telegram-bot/api'
import { formatUzs } from '@/lib/money'
import { isHttpsUrl, tgLaunchUrl } from '@/lib/tg/next'

// Customer order messages through the shop's Telegram bot (when the order phone has a linked account with
// notifications on): "order received" right after checkout, then every staff status change. Never throw: callers
// run them after the order / status change has been committed.

type Lang = 'uz' | 'ru' | 'en'
export type NotifyOutcome = 'sent' | 'skipped' | 'failed'
type Deps = { fetchImpl?: typeof fetch; siteUrl?: string }

const STATUS: Record<Lang, Record<string, string>> = {
  uz: { NEW: 'qabul qilindi', CONFIRMED: 'tasdiqlandi', SHIPPING: 'yo‘lga chiqdi — kuryer yo‘lda', DELIVERED: 'yetkazildi', CANCELLED: 'bekor qilindi' },
  ru: { NEW: 'принят', CONFIRMED: 'подтверждён', SHIPPING: 'передан курьеру — в пути', DELIVERED: 'доставлен', CANCELLED: 'отменён' },
  en: { NEW: 'received', CONFIRMED: 'confirmed', SHIPPING: 'out for delivery', DELIVERED: 'delivered', CANCELLED: 'cancelled' },
}

const TEXT: Record<Lang, { line: (n: number, s: string) => string; button: string; placed: (n: number, items: number, total: string) => string }> = {
  uz: {
    line: (n, s) => `Buyurtma №${n} ${s}.`,
    button: 'Buyurtmani ko‘rish',
    placed: (n, items, total) =>
      `Buyurtma №${n} qabul qilindi: ${items} ta mahsulot, ${total}. To‘lov — yetkazib berilganda. Tasdiqlanganda shu yerga xabar yuboramiz.`,
  },
  ru: {
    line: (n, s) => `Заказ №${n} ${s}.`,
    button: 'Открыть заказ',
    placed: (n, items, total) =>
      `Заказ №${n} принят: товаров — ${items}, на сумму ${total}. Оплата при получении. Мы напишем сюда, когда заказ подтвердят.`,
  },
  en: {
    line: (n, s) => `Order #${n} is now ${s}.`,
    button: 'View order',
    placed: (n, items, total) =>
      `Order #${n} received: ${items} ${items === 1 ? 'item' : 'items'}, ${total}. Payment on delivery. We will message you here when it is confirmed.`,
  },
}

const toLang = (v: string | null | undefined): Lang => (v === 'ru' || v === 'en' ? v : 'uz')

/** Customer-facing status name (bot messages, /orders). */
export const statusLabel = (lang: Lang, status: string): string => STATUS[lang][status] ?? status

/** Absolute http(s) base without a trailing slash, or null. */
function baseUrl(v: string | undefined): string | null {
  const s = (v ?? '').trim().replace(/\/+$/, '')
  if (!s) return null
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:' ? s : null
  } catch {
    return null
  }
}

/** "Open order" button: inside the Mini App (web_app via /tg) on https, a plain link on http, none without a site URL. */
function orderButton(lang: Lang, number: number, deps: Deps): InlineButton[][] | undefined {
  const site = baseUrl(deps.siteUrl ?? process.env.SITE_URL)
  if (!site) return undefined
  const path = `/${lang}/account/orders/${number}`
  const launch = tgLaunchUrl(path, site)
  const b: InlineButton = isHttpsUrl(launch) ? { text: TEXT[lang].button, webApp: launch } : { text: TEXT[lang].button, url: `${site}${path}` }
  return [[b]]
}

/** The order's customer chat, when its phone has a linked account with notifications on. */
async function chatFor(phone: string): Promise<string | null> {
  const c = await prisma.customer.findUnique({
    where: { phone },
    select: { telegramChatId: true, notifyTelegram: true, accountCreatedAt: true },
  })
  return c && c.accountCreatedAt && c.telegramChatId && c.notifyTelegram ? c.telegramChatId : null
}

async function send(chatId: string, text: string, buttons: InlineButton[][] | undefined, deps: Deps): Promise<NotifyOutcome> {
  const ok = await sendCustomerMessage(chatId, text, buttons ? { buttons } : {}, deps.fetchImpl)
  return ok ? 'sent' : 'failed'
}

/**
 * `to` = the status the order was just changed to (callers pass it, so a later change racing this background task
 * cannot make the message name the wrong status); omitted -> the order's current status is read.
 */
export async function notifyOrderStatus(orderId: number, to?: string, deps: Deps = {}): Promise<NotifyOutcome> {
  try {
    if (!Number.isSafeInteger(orderId) || orderId <= 0) return 'skipped'
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { number: true, status: true, phone: true, locale: true } })
    if (!order) return 'skipped'
    const chatId = await chatFor(order.phone)
    if (!chatId) return 'skipped'
    const lang = toLang(order.locale)
    const current = typeof to === 'string' && to ? to : order.status
    const text = TEXT[lang].line(order.number, STATUS[lang][current] ?? current)
    return await send(chatId, text, orderButton(lang, order.number, deps), deps)
  } catch {
    return 'failed'
  }
}

/** "Order received" right after checkout (pay on delivery), with the item count and total. */
export async function notifyOrderPlaced(orderNumber: number, deps: Deps = {}): Promise<NotifyOutcome> {
  try {
    if (!Number.isSafeInteger(orderNumber) || orderNumber <= 0) return 'skipped'
    const order = await prisma.order.findUnique({
      where: { number: orderNumber },
      select: { number: true, phone: true, locale: true, totalUzs: true, lines: { select: { qty: true } } },
    })
    if (!order) return 'skipped'
    const chatId = await chatFor(order.phone)
    if (!chatId) return 'skipped'
    const lang = toLang(order.locale)
    const items = order.lines.reduce((n, l) => n + l.qty, 0)
    const text = TEXT[lang].placed(order.number, items, formatUzs(order.totalUzs, lang))
    return await send(chatId, text, orderButton(lang, order.number, deps), deps)
  } catch {
    return 'failed'
  }
}
