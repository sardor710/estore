// The one Telegram update handler, shared by the webhook route (production) and scripts/bot-poll.ts (local dev).
//
// Customer sign-in (see src/lib/account/login.ts for the state machine):
//   /start login_<token>  -> bind the login to this Telegram user; known account -> confirm prompt,
//                            otherwise ask for the phone with a request_contact reply keyboard
//   contact message       -> must be the sender's own UZ number -> link account -> confirm prompt
//   pick:<loginId>:<code> -> the user taps the code shown on THEIR website screen (1 real + 5 decoys in 2 rows of
//                            3; a wrong pick cancels and blocks this Telegram user's sign-ins for a minute)
//                            -> website signs in + "New sign-in ... Not you?" alert
//   signout_all           -> bumps sessionVersion of the sender's account (every website session dies)
// Only private chats are handled. The real check code never appears in message text, only as one of 6 buttons.

import { prisma } from '@/lib/db'
import { confirmLogin, findPendingLogin, linkTelegramContact, linkTelegramContactDirect, loginChoices, loginForTelegramUser } from '@/lib/account/login'
import { isHttpsUrl, tgLaunchUrl } from '@/lib/tg/next'
import { cleanLatLng } from '@/lib/geo'
import { setAddressPin } from '@/lib/account/addresses'
import { statusLabel } from '@/lib/account/notify'
import { formatUzs } from '@/lib/money'
import {
  answerCallbackQuery,
  contactKeyboard,
  editBotMessage,
  inlineKeyboard,
  REMOVE_KEYBOARD,
  sendBotMessage,
  type ReplyMarkup,
} from './api'
import { botCopy, botLocale, tashkentTime, type BotCopy, type BotLocale } from './messages'

export type BotDeps = { fetchImpl?: typeof fetch; now?: Date }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const tgId = (v: unknown): string | null => (typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : null)

type Ctx = { f: typeof fetch; now: Date; locale: BotLocale; copy: BotCopy; userId: string; chatId: string }

/** Public site base (no trailing slash) from SITE_URL, or null when not configured. */
function siteBase(): string | null {
  const raw = (process.env.SITE_URL ?? '').trim()
  if (!/^https?:\/\//i.test(raw)) return null
  return raw.replace(/\/+$/, '')
}
const siteHome = (l: BotLocale) => (siteBase() ? `${siteBase()}/${l}` : null)
const siteLogin = (l: BotLocale) => (siteBase() ? `${siteBase()}/${l}/login` : null)

/** Handles one Bot API Update. Never throws (errors are logged): Telegram must always get a quick 200. */
export async function handleUpdate(update: unknown, deps: BotDeps = {}): Promise<void> {
  try {
    if (!isObj(update)) return
    const f = deps.fetchImpl ?? fetch
    const now = deps.now ?? new Date()
    if (isObj(update.message)) await onMessage(update.message, f, now)
    else if (isObj(update.callback_query)) await onCallback(update.callback_query, f, now)
  } catch (e) {
    console.error('[telegram-bot] update failed:', e instanceof Error ? e.message : e)
  }
}

function contextOf(from: unknown, chat: unknown, f: typeof fetch, now: Date): Ctx | null {
  if (!isObj(from) || !isObj(chat) || chat.type !== 'private' || from.is_bot === true) return null
  const userId = tgId(from.id)
  const chatId = tgId(chat.id)
  if (!userId || !chatId) return null
  const locale = botLocale(from.language_code)
  return { f, now, locale, copy: botCopy(locale), userId, chatId }
}

const say = (ctx: Ctx, text: string, markup?: ReplyMarkup) => sendBotMessage(ctx.chatId, text, markup, ctx.f)

/** One button that opens `path` in the Mini App (web_app, needs https), else in the browser; null without SITE_URL. */
export function shopButton(text: string, path: string): { text: string; webApp?: string; url?: string } | null {
  const launch = tgLaunchUrl(path)
  if (isHttpsUrl(launch)) return { text, webApp: launch }
  const base = siteBase()
  return base ? { text, url: `${base}${path}` } : null
}
const openShopMarkup = (ctx: Ctx, path = `/${ctx.locale}`): ReplyMarkup | undefined => {
  const b = shopButton(ctx.copy.openShopButton, path)
  return b ? inlineKeyboard([[b]]) : undefined
}

// ---------- messages ----------

const START_LOGIN = /^\/start(?:@\w+)?\s+login_([A-Za-z0-9_-]{16,64})\s*$/

async function onMessage(msg: Obj, f: typeof fetch, now: Date) {
  const ctx = contextOf(msg.from, msg.chat, f, now)
  if (!ctx) return
  if (isObj(msg.contact)) return onContact(ctx, msg.contact, msg.from as Obj)
  if (isObj(msg.location)) return onLocation(ctx, msg.location)
  if (typeof msg.text !== 'string') return
  const m = START_LOGIN.exec(msg.text.trim())
  if (m) return onStartLogin(ctx, m[1])
  if (/^\/start(?:@\w+)?\s+login_/.test(msg.text.trim())) return say(ctx, ctx.copy.linkExpired(siteLogin(ctx.locale)))
  if (/^\/orders(?:@\w+)?$/.test(msg.text.trim())) return onOrders(ctx)
  await say(ctx, ctx.copy.welcome(siteHome(ctx.locale)), openShopMarkup(ctx))
}

/** Linked account of this Telegram user (account created), or null. */
async function accountOf(ctx: Ctx) {
  const c = await prisma.customer.findUnique({ where: { telegramUserId: ctx.userId }, select: { id: true, phone: true, accountCreatedAt: true } })
  return c?.accountCreatedAt ? c : null
}

/** /orders: the 5 newest orders of the linked account, each with a button opening it in the Mini App. */
async function onOrders(ctx: Ctx) {
  const c = await accountOf(ctx)
  if (!c) return say(ctx, ctx.copy.askPhoneInShop, openShopMarkup(ctx))
  const orders = await prisma.order.findMany({
    where: { phone: c.phone },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 5,
    select: { number: true, status: true, totalUzs: true },
  })
  if (!orders.length) return say(ctx, ctx.copy.noOrders, openShopMarkup(ctx))
  const lines = orders.map((o) => `#${o.number} · ${statusLabel(ctx.locale, o.status)} · ${formatUzs(o.totalUzs, ctx.locale)}`)
  const buttons = orders.map((o) => shopButton(`#${o.number}`, `/${ctx.locale}/account/orders/${o.number}`)).filter((b) => b !== null)
  await say(ctx, [ctx.copy.ordersHeader, ...lines].join('\n'), buttons.length ? inlineKeyboard(buttons.map((b) => [b])) : undefined)
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** A location sent in the chat: attach it to a saved address (buttons) or open a new address in the Mini App. */
async function onLocation(ctx: Ctx, loc: Obj) {
  const pin = cleanLatLng(loc.latitude, loc.longitude)
  if (!pin || pin === 'INVALID') return
  const c = await accountOf(ctx)
  if (!c) return say(ctx, ctx.copy.askPhoneInShop, openShopMarkup(ctx))
  const addresses = await prisma.customerAddress.findMany({
    where: { customerId: c.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, label: true, recipient: true, address: true },
  })
  const lat = pin.lat.toFixed(6)
  const lng = pin.lng.toFixed(6)
  const rows: { text: string; data?: string; webApp?: string; url?: string }[][] = addresses.map((a) => [
    { text: short(`${a.label || a.recipient} — ${a.address}`, 48), data: `loc:${a.id}:${lat}:${lng}` },
  ])
  const add = shopButton(ctx.copy.newAddressButton, `/${ctx.locale}/account/addresses?lat=${lat}&lng=${lng}`)
  if (add) rows.push([add])
  if (!rows.length) return
  await say(ctx, ctx.copy.locationPick, inlineKeyboard(rows))
}

async function onStartLogin(ctx: Ctx, token: string) {
  const r = await loginForTelegramUser(token, ctx.userId, ctx.now)
  if (r === 'expired') return say(ctx, ctx.copy.linkExpired(siteLogin(ctx.locale)))
  if (r === 'cooldown') return say(ctx, ctx.copy.tooManyAttempts)
  if (r === 'unknown_user') return say(ctx, ctx.copy.askContact, contactKeyboard(ctx.copy.shareButton))
  await sendConfirmPrompt(ctx, r.loginId)
}

async function onContact(ctx: Ctx, contact: Obj, from: Obj) {
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const name = [str(contact.first_name), str(contact.last_name)].filter(Boolean).join(' ') || str(from.first_name)
  const loginId = await findPendingLogin(ctx.userId, ctx.now)
  if (loginId === null) return onContactDirect(ctx, contact, name)
  const r = await linkTelegramContact(
    {
      token: { id: loginId },
      telegramUserId: ctx.userId,
      chatId: ctx.chatId,
      contactUserId: tgId(contact.user_id) ?? '', // missing user_id = a contact card, never the sender's own
      phone: str(contact.phone_number),
      name,
      locale: ctx.locale,
    },
    {
      now: ctx.now,
      onRelinked: async (oldChatId) => {
        await sendBotMessage(oldChatId, ctx.copy.relinked, undefined, ctx.f)
      },
    },
  )
  // A forwarded contact gets the share button again (the sender can still share their own number).
  if (r === 'not_own_contact') return say(ctx, ctx.copy.notOwnContact, contactKeyboard(ctx.copy.shareButton))
  if (r === 'bad_phone') return say(ctx, ctx.copy.badPhone, REMOVE_KEYBOARD)
  if (r === 'expired') return say(ctx, ctx.copy.linkExpired(siteLogin(ctx.locale)), REMOVE_KEYBOARD)
  await say(ctx, ctx.copy.phoneReceived, REMOVE_KEYBOARD)
  await sendConfirmPrompt(ctx, loginId)
}

/** No website sign-in pending: the Mini App's requestContact (or a plain share) links the phone directly. */
async function onContactDirect(ctx: Ctx, contact: Obj, name: string) {
  const r = await linkTelegramContactDirect(
    {
      telegramUserId: ctx.userId,
      chatId: ctx.chatId,
      contactUserId: tgId(contact.user_id) ?? '',
      phone: typeof contact.phone_number === 'string' ? contact.phone_number : '',
      name,
      locale: ctx.locale,
    },
    { now: ctx.now, onRelinked: async (oldChatId) => void (await sendBotMessage(oldChatId, ctx.copy.relinked, undefined, ctx.f)) },
  )
  if (r === 'not_own_contact') return say(ctx, ctx.copy.notOwnContact, contactKeyboard(ctx.copy.shareButton))
  if (r === 'bad_phone') return say(ctx, ctx.copy.badPhone, REMOVE_KEYBOARD)
  await say(ctx, ctx.copy.phoneLinked, REMOVE_KEYBOARD)
  const markup = openShopMarkup(ctx)
  if (markup) await say(ctx, ctx.copy.shop, markup)
}

/** Warning + "tap the code you see on the website" with 6 buttons in rows of 3. The real code is only a button label. */
async function sendConfirmPrompt(ctx: Ctx, loginId: number) {
  const choices = await loginChoices({ id: loginId }, ctx.now)
  if (!choices) return say(ctx, ctx.copy.requestExpired)
  const buttons = choices.map((c) => ({ text: c, data: `pick:${loginId}:${c}` }))
  const rows: (typeof buttons)[] = []
  for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3))
  await say(ctx, ctx.copy.confirmPrompt, inlineKeyboard(rows))
}

// ---------- button presses ----------

const PICK = /^pick:(\d{1,12}):(\d{4})$/
const LOC = /^loc:(\d{1,12}):(-?\d{1,3}\.\d{1,6}):(-?\d{1,3}\.\d{1,6})$/

async function onCallback(cq: Obj, f: typeof fetch, now: Date) {
  const id = typeof cq.id === 'string' ? cq.id : null
  const message = isObj(cq.message) ? cq.message : null
  if (!id || !message) return
  const ctx = contextOf(cq.from, message.chat, f, now)
  if (!ctx) return
  const data = typeof cq.data === 'string' ? cq.data : ''
  const messageId = typeof message.message_id === 'number' ? message.message_id : null

  if (data === 'signout_all') {
    const r = await signOutEverywhereByTelegram(ctx.userId)
    await answerCallbackQuery(id, r ? ctx.copy.signedOutAll : ctx.copy.noAccount, { alert: true }, f)
    return
  }

  const lm = LOC.exec(data)
  if (lm) {
    const c = await accountOf(ctx)
    const ok = !!c && (await setAddressPin(c.id, Number(lm[1]), Number(lm[2]), Number(lm[3])))
    await answerCallbackQuery(id, ok ? ctx.copy.locationSaved : ctx.copy.locationFailed, {}, f)
    if (ok && messageId !== null) await editBotMessage(ctx.chatId, messageId, ctx.copy.locationSaved, f)
    return
  }

  const m = PICK.exec(data)
  if (!m) {
    await answerCallbackQuery(id, undefined, {}, f)
    return
  }
  const loginId = Number(m[1])
  const r = await confirmLogin({ id: loginId }, ctx.userId, m[2], ctx.now)
  if (r === 'mismatch') {
    await answerCallbackQuery(id, ctx.copy.mismatch, {}, f)
    return
  }
  if (r === 'cooldown') {
    await answerCallbackQuery(id, ctx.copy.tooManyAttempts, { alert: true }, f)
    return
  }
  await answerCallbackQuery(id, undefined, {}, f)
  // Replace the prompt (drops its buttons); fall back to a new message if it can't be edited.
  const replace = async (text: string) => {
    if (messageId === null || !(await editBotMessage(ctx.chatId, messageId, text, f))) await say(ctx, text)
  }
  if (r === 'ok') {
    await replace(ctx.copy.signedIn)
    await say(ctx, ctx.copy.newSignIn(tashkentTime(ctx.now)), inlineKeyboard([[{ text: ctx.copy.signOutAllButton, data: 'signout_all' }]]))
  } else if (r === 'wrong_code') {
    await replace(ctx.copy.wrongCode)
  } else {
    await replace(ctx.copy.requestExpired)
  }
}

/** "Not me": revokes every website session of the account linked to this Telegram user. False if none. */
export async function signOutEverywhereByTelegram(telegramUserId: string): Promise<boolean> {
  if (!telegramUserId) return false
  const r = await prisma.customer.updateMany({
    where: { telegramUserId, accountCreatedAt: { not: null } },
    data: { sessionVersion: { increment: 1 } },
  })
  return r.count > 0
}
