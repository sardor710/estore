// The one Telegram update handler, shared by the webhook route (production) and scripts/bot-poll.ts (local dev).
//
// Customer sign-in (see src/lib/account/login.ts for the state machine):
//   /start login_<token>  -> bind the login to this Telegram user; known account -> confirm prompt,
//                            otherwise ask for the phone with a request_contact reply keyboard
//   contact message       -> must be the sender's own UZ number -> link account -> confirm prompt
//   pick:<loginId>:<code> -> the user taps the code shown on THEIR website screen (1 real + 5 decoys in 2 rows of
//                            3; a wrong pick cancels and blocks this Telegram user's sign-ins for a minute)
//                            -> website signs in + "New sign-in ... Not you?" alert
//   /logout               -> confirm prompt; logout:yes bumps sessionVersion of the sender's account (every website
//                            session dies). The sign-in alert has no button so it cannot be pressed by accident.
//   /notifications, /language, /account, /help -> bot-only settings (notifyTelegram, accountLocale) and info.
// The bot answers in the account's saved language (accountLocale), else the Telegram app language.
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
import { botCopy, botLocale, LANGUAGE_FLAGS, LANGUAGE_NAMES, tashkentTime, type BotCopy, type BotLocale } from './messages'

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

const isBotLocale = (v: unknown): v is BotLocale => v === 'uz' || v === 'ru' || v === 'en'

/** Switches the context to the linked account's saved language, when it has one. */
async function withAccountLocale(ctx: Ctx): Promise<Ctx> {
  const c = await prisma.customer.findUnique({ where: { telegramUserId: ctx.userId }, select: { accountLocale: true, accountCreatedAt: true } })
  const l = c?.accountCreatedAt ? c.accountLocale : null
  return isBotLocale(l) && l !== ctx.locale ? { ...ctx, locale: l, copy: botCopy(l) } : ctx
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

const command = (text: string, name: string) => new RegExp(`^/${name}(?:@\\w+)?$`).test(text)

async function onMessage(msg: Obj, f: typeof fetch, now: Date) {
  const base = contextOf(msg.from, msg.chat, f, now)
  if (!base) return
  const ctx = await withAccountLocale(base)
  if (isObj(msg.contact)) return onContact(ctx, msg.contact, msg.from as Obj)
  if (isObj(msg.location)) return onLocation(ctx, msg.location)
  if (typeof msg.text !== 'string') return
  const m = START_LOGIN.exec(msg.text.trim())
  if (m) return onStartLogin(ctx, m[1])
  if (/^\/start(?:@\w+)?\s+login_/.test(msg.text.trim())) return say(ctx, ctx.copy.linkExpired(siteLogin(ctx.locale)))
  const text = msg.text.trim()
  if (command(text, 'orders')) return onOrders(ctx)
  if (command(text, 'logout')) return say(ctx, ctx.copy.logoutConfirm, logoutMarkup(ctx))
  if (command(text, 'notifications')) return onNotifications(ctx)
  if (command(text, 'language')) return say(ctx, ctx.copy.languagePrompt, languageMarkup())
  if (command(text, 'account')) return onAccount(ctx)
  if (command(text, 'help')) return say(ctx, ctx.copy.help, openShopMarkup(ctx))
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

// ---------- bot-only settings ----------

const logoutMarkup = (ctx: Ctx) =>
  inlineKeyboard([[{ text: ctx.copy.logoutYes, data: 'logout:yes' }, { text: ctx.copy.logoutNo, data: 'logout:no' }]])

const notifyMarkup = (ctx: Ctx, on: boolean) =>
  inlineKeyboard([[on ? { text: ctx.copy.notifyTurnOff, data: 'notify:off' } : { text: ctx.copy.notifyTurnOn, data: 'notify:on' }]])

const languageMarkup = () =>
  inlineKeyboard([(['uz', 'ru', 'en'] as const).map((l) => ({ text: `${LANGUAGE_FLAGS[l]} ${LANGUAGE_NAMES[l]}`, data: `lang:${l}` }))])

/** /notifications: current state + one toggle button (order status messages, Customer.notifyTelegram). */
async function onNotifications(ctx: Ctx) {
  const c = await prisma.customer.findUnique({ where: { telegramUserId: ctx.userId }, select: { notifyTelegram: true, accountCreatedAt: true } })
  if (!c?.accountCreatedAt) return say(ctx, ctx.copy.askPhoneInShop, openShopMarkup(ctx))
  await say(ctx, ctx.copy.notifyStatus(c.notifyTelegram), notifyMarkup(ctx, c.notifyTelegram))
}

/** /account: which website account this Telegram is linked to, plus the bot settings. */
async function onAccount(ctx: Ctx) {
  const c = await prisma.customer.findUnique({
    where: { telegramUserId: ctx.userId },
    select: { name: true, phone: true, notifyTelegram: true, accountCreatedAt: true },
  })
  if (!c?.accountCreatedAt) return say(ctx, ctx.copy.askPhoneInShop, openShopMarkup(ctx))
  const profile = shopButton(ctx.copy.profileButton, `/${ctx.locale}/account`)
  await say(
    ctx,
    ctx.copy.accountInfo({ name: c.name, phone: c.phone, language: LANGUAGE_NAMES[ctx.locale], notify: c.notifyTelegram }),
    profile ? inlineKeyboard([[profile]]) : undefined,
  )
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
  const base = contextOf(cq.from, message.chat, f, now)
  if (!base) return
  let ctx = await withAccountLocale(base)
  const data = typeof cq.data === 'string' ? cq.data : ''
  const messageId = typeof message.message_id === 'number' ? message.message_id : null
  const edit = async (text: string, markup?: ReplyMarkup) => {
    if (messageId === null || !(await editBotMessage(ctx.chatId, messageId, text, f, markup))) await say(ctx, text, markup)
  }

  // Old sign-in alerts still carry a "Sign out everywhere" button: it now only opens the confirm step.
  if (data === 'signout_all') {
    await answerCallbackQuery(id, undefined, {}, f)
    await say(ctx, ctx.copy.logoutConfirm, logoutMarkup(ctx))
    return
  }
  if (data === 'logout:yes') {
    const r = await signOutEverywhereByTelegram(ctx.userId)
    await answerCallbackQuery(id, undefined, {}, f)
    await edit(r ? ctx.copy.signedOutAll : ctx.copy.noAccount)
    return
  }
  if (data === 'logout:no') {
    await answerCallbackQuery(id, undefined, {}, f)
    await edit(ctx.copy.logoutCancelled)
    return
  }
  if (data === 'notify:on' || data === 'notify:off') {
    const on = data === 'notify:on'
    const r = await prisma.customer.updateMany({ where: { telegramUserId: ctx.userId, accountCreatedAt: { not: null } }, data: { notifyTelegram: on } })
    if (!r.count) {
      await answerCallbackQuery(id, ctx.copy.noAccount, { alert: true }, f)
      return
    }
    await answerCallbackQuery(id, undefined, {}, f)
    await edit(ctx.copy.notifyStatus(on), notifyMarkup(ctx, on))
    return
  }
  const lg = /^lang:(uz|ru|en)$/.exec(data)
  if (lg) {
    const l = lg[1] as BotLocale
    const r = await prisma.customer.updateMany({ where: { telegramUserId: ctx.userId, accountCreatedAt: { not: null } }, data: { accountLocale: l } })
    if (!r.count) {
      await answerCallbackQuery(id, ctx.copy.noAccount, { alert: true }, f)
      return
    }
    ctx = { ...ctx, locale: l, copy: botCopy(l) }
    await answerCallbackQuery(id, undefined, {}, f)
    await edit(ctx.copy.languageSaved)
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
  const replace = (text: string) => edit(text)
  if (r === 'ok') {
    await replace(ctx.copy.signedIn)
    await say(ctx, ctx.copy.newSignIn(tashkentTime(ctx.now)))
  } else if (r === 'wrong_code') {
    await replace(ctx.copy.wrongCode)
  } else {
    await replace(ctx.copy.requestExpired)
  }
}

/** /logout confirmed: revokes every website session of the account linked to this Telegram user. False if none. */
export async function signOutEverywhereByTelegram(telegramUserId: string): Promise<boolean> {
  if (!telegramUserId) return false
  const r = await prisma.customer.updateMany({
    where: { telegramUserId, accountCreatedAt: { not: null } },
    data: { sessionVersion: { increment: 1 } },
  })
  return r.count > 0
}
