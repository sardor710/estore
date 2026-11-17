import { createHash, randomBytes, randomInt } from 'node:crypto'
import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { safeEqual } from '@/lib/auth'
import { normalizeUzPhoneStrict } from '@/lib/phone'
import { locales, type Locale } from '@/i18n/routing'

// Website sign-in through the shop's Telegram bot.
//
// Flow: the website calls startLogin() -> keeps `browserSecret` in an httpOnly cookie, shows `checkCode`, and puts
// `token` only into the t.me deep link. The bot (/start login_<token>) calls loginForTelegramUser(), which binds the
// login to the Telegram user who opened it. A new user shares their own contact -> linkTelegramContact(). The bot
// then shows loginChoices() as 6 buttons; the user must pick the code shown on THEIR website screen ->
// confirmLogin() (a wrong pick cancels the login, against phished deep links, and blocks that Telegram user from
// starting/confirming sign-ins for WRONG_PICK_COOLDOWN_MS). The website polls collectLogin(), which hands out the
// customer id exactly once, and only to the browser holding `browserSecret`.
//
// Row status: PENDING -> CONFIRMED -> USED, or PENDING -> WRONG_CODE (cancelled by a wrong pick; its expiresAt is
// set to the time of the pick, which is what the cooldown is measured from).
//
// Only SHA-256 hashes of the token and browser secret are stored.

export const LOGIN_TTL_MS = 10 * 60_000
/** After a wrong pick the same Telegram user cannot start or confirm another sign-in for this long. */
export const WRONG_PICK_COOLDOWN_MS = 60_000
/** Number of code buttons in the bot (1 real + decoys): a blind guess succeeds 1 time in CHOICES_COUNT. */
export const CHOICES_COUNT = 6
/** CustomerLogin rows are kept this long (disputed sign-ins), then deleted opportunistically by startLogin. */
export const LOGIN_RETENTION_MS = 30 * 24 * 60 * 60_000

/**
 * A login is addressed by its raw token (website, deep link) or, inside the bot after /start, by its row id
 * (contact messages carry no token; callback_data is 64 bytes max). Every bot-side function also checks the
 * Telegram user the login was bound to at /start, so an id alone grants nothing.
 */
export type LoginKey = string | { id: number }

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const secret = () => randomBytes(32).toString('base64url')
const fourDigits = () => String(randomInt(0, 10_000)).padStart(4, '0')

async function findLogin(key: LoginKey) {
  if (typeof key === 'string') {
    if (!key) return null
    return prisma.customerLogin.findUnique({ where: { tokenHash: sha256(key) } })
  }
  if (!key || !Number.isSafeInteger(key.id) || key.id <= 0) return null
  return prisma.customerLogin.findUnique({ where: { id: key.id } })
}

type LoginRow = NonNullable<Awaited<ReturnType<typeof findLogin>>>
const isOpen = (row: LoginRow | null, now: Date): row is LoginRow => !!row && row.status === 'PENDING' && row.expiresAt > now

/** True while this Telegram user is cooling down after a wrong pick (a WRONG_CODE row picked < 60 s ago). */
async function inCooldown(telegramUserId: string, now: Date): Promise<boolean> {
  const n = await prisma.customerLogin.count({
    where: {
      pendingTelegramUserId: telegramUserId,
      status: 'WRONG_CODE',
      expiresAt: { gt: new Date(now.getTime() - WRONG_PICK_COOLDOWN_MS), lte: now },
    },
  })
  return n > 0
}

export async function startLogin(now: Date = new Date()): Promise<{ token: string; browserSecret: string; checkCode: string; expiresAt: Date }> {
  await prisma.customerLogin.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - LOGIN_RETENTION_MS) } } })
  const token = secret()
  const browserSecret = secret()
  const checkCode = fourDigits()
  const expiresAt = new Date(now.getTime() + LOGIN_TTL_MS)
  await prisma.customerLogin.create({
    data: { tokenHash: sha256(token), browserHash: sha256(browserSecret), checkCode, expiresAt, createdAt: now },
  })
  return { token, browserSecret, checkCode, expiresAt }
}

/**
 * Bot `/start login_<token>`: binds the login to this Telegram user (first opener wins; another user gets
 * 'expired'). Known account -> attaches the customer and returns the check code (+ row id for later bot steps);
 * otherwise 'unknown_user' and the bot asks for the contact. 'cooldown' (login left untouched) within a minute of
 * this Telegram user's last wrong pick.
 */
export async function loginForTelegramUser(
  token: string,
  telegramUserId: string,
  now: Date = new Date(),
): Promise<{ checkCode: string; loginId: number } | 'expired' | 'unknown_user' | 'cooldown'> {
  const row = await findLogin(token)
  if (!isOpen(row, now) || !telegramUserId) return 'expired'
  if (await inCooldown(telegramUserId, now)) return 'cooldown'
  const bound = await prisma.customerLogin.updateMany({
    where: { id: row.id, status: 'PENDING', OR: [{ pendingTelegramUserId: null }, { pendingTelegramUserId: telegramUserId }] },
    data: { pendingTelegramUserId: telegramUserId },
  })
  if (bound.count !== 1) return 'expired'
  const c = await prisma.customer.findUnique({ where: { telegramUserId }, select: { id: true, accountCreatedAt: true } })
  if (!c || !c.accountCreatedAt) return 'unknown_user'
  await prisma.customerLogin.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { customerId: c.id } })
  return { checkCode: row.checkCode, loginId: row.id }
}

/** Latest open login bound (at /start) to this Telegram user — how the bot finds the login for a contact message. */
export async function findPendingLogin(telegramUserId: string, now: Date = new Date()): Promise<number | null> {
  if (!telegramUserId) return null
  const row = await prisma.customerLogin.findFirst({
    where: { pendingTelegramUserId: telegramUserId, status: 'PENDING', expiresAt: { gt: now } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  })
  return row?.id ?? null
}

const cleanName = (s: string) =>
  (typeof s === 'string' ? s : '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
const toLocale = (v: unknown): Locale | null => ((locales as readonly string[]).includes(v as string) ? (v as Locale) : null)

type ContactInput = { telegramUserId: string; chatId: string; contactUserId: string; phone: string; name: string; locale?: Locale }
type LinkOpts = { onRelinked?: (oldChatId: string) => void | Promise<void>; now?: Date }

/** Own contact + strict UZ number check shared by both link paths. */
function checkContact(i: ContactInput, tg: string): { phone: string } | 'not_own_contact' | 'bad_phone' {
  if (!i.contactUserId || String(i.contactUserId) !== tg) return 'not_own_contact'
  const phone = normalizeUzPhoneStrict(i.phone)
  return phone ? { phone } : 'bad_phone'
}

/**
 * The account-linking writes (inside a transaction): upsert the Customer by phone, set the Telegram ids and
 * `accountCreatedAt` (if null). Newest verified contact wins: a phone linked to another Telegram user is relinked
 * (its `sessionVersion` bumped, the old chat id returned for the "your number moved" notice). If this Telegram
 * user was linked to a different phone, that old account loses the link, its sessions and its account state.
 */
async function linkPhoneTx(
  tx: Prisma.TransactionClient,
  a: { tg: string; chatId: string; phone: string; name: string; locale: Locale | null },
  now: Date,
): Promise<{ customerId: number; oldChatId: string | null }> {
  // This Telegram user previously linked to a different phone: release it (telegramUserId is unique). It is no
  // longer an account either (nobody can sign in to it), so the admin badge / account state stay honest.
  await tx.customer.updateMany({
    where: { telegramUserId: a.tg, phone: { not: a.phone } },
    data: { telegramUserId: null, telegramChatId: null, accountCreatedAt: null, sessionVersion: { increment: 1 } },
  })
  const existing = await tx.customer.findUnique({ where: { phone: a.phone } })
  if (existing) {
    const relinked = !!existing.telegramUserId && existing.telegramUserId !== a.tg
    await tx.customer.update({
      where: { id: existing.id },
      data: {
        telegramUserId: a.tg,
        telegramChatId: a.chatId,
        accountLocale: a.locale ?? existing.accountLocale,
        accountCreatedAt: existing.accountCreatedAt ?? now,
        ...(relinked ? { sessionVersion: { increment: 1 } } : {}),
      },
    })
    return { customerId: existing.id, oldChatId: relinked ? existing.telegramChatId : null }
  }
  const c = await tx.customer.create({
    data: {
      phone: a.phone,
      name: cleanName(a.name) || a.phone,
      region: '',
      tags: [],
      telegramUserId: a.tg,
      telegramChatId: a.chatId,
      accountLocale: a.locale,
      accountCreatedAt: now,
    },
    select: { id: true },
  })
  return { customerId: c.id, oldChatId: null }
}

async function notifyRelinked(oldChatId: string | null, opts: LinkOpts): Promise<void> {
  if (!oldChatId || !opts.onRelinked) return
  try {
    await opts.onRelinked(oldChatId)
  } catch {
    // a failed "your number moved" notice must not break the sign-in
  }
}

/**
 * Contact shared in the bot during a website sign-in. Accepted only if it is the sender's own contact
 * (`contactUserId === telegramUserId`, which the bot takes from `contact.user_id` / `from.id`) and a full UZ
 * international number (strict: 998 + 9 digits, no 9-digit shortcut, so a foreign 9-digit number never becomes +998).
 * Links the account (see linkPhoneTx) and attaches it to the pending login.
 */
export async function linkTelegramContact(
  i: { token: LoginKey } & ContactInput,
  opts: LinkOpts = {},
): Promise<'ok' | 'not_own_contact' | 'bad_phone' | 'expired'> {
  const now = opts.now ?? new Date()
  const tg = String(i.telegramUserId ?? '')
  const row = await findLogin(i.token)
  if (!isOpen(row, now) || !tg) return 'expired'
  if (row.pendingTelegramUserId && row.pendingTelegramUserId !== tg) return 'expired'
  const checked = checkContact(i, tg)
  if (typeof checked === 'string') return checked

  const result = await prisma.$transaction(async (tx) => {
    const r = await linkPhoneTx(tx, { tg, chatId: String(i.chatId ?? ''), phone: checked.phone, name: i.name, locale: toLocale(i.locale) }, now)
    const attached = await tx.customerLogin.updateMany({
      where: { id: row.id, status: 'PENDING' },
      data: { customerId: r.customerId, pendingTelegramUserId: tg },
    })
    if (attached.count !== 1) throw new LoginGone()
    return r
  }).catch((e) => {
    if (e instanceof LoginGone) return null
    throw e
  })
  if (!result) return 'expired'
  await notifyRelinked(result.oldChatId, opts)
  return 'ok'
}

/**
 * Contact shared in the bot with no website sign-in pending — the Telegram Mini App's "Share phone number"
 * (`requestContact`). Same checks and linking rules as linkTelegramContact, without a login row.
 */
export async function linkTelegramContactDirect(
  i: ContactInput,
  opts: LinkOpts = {},
): Promise<'ok' | 'not_own_contact' | 'bad_phone'> {
  const now = opts.now ?? new Date()
  const tg = String(i.telegramUserId ?? '')
  if (!tg) return 'not_own_contact'
  const checked = checkContact(i, tg)
  if (typeof checked === 'string') return checked
  const r = await prisma.$transaction((tx) =>
    linkPhoneTx(tx, { tg, chatId: String(i.chatId ?? ''), phone: checked.phone, name: i.name, locale: toLocale(i.locale) }, now),
  )
  await notifyRelinked(r.oldChatId, opts)
  return 'ok'
}

class LoginGone extends Error {}

/**
 * The 6 bot buttons: the real check code + 5 distinct random decoys, shuffled; generated once and stored so the
 * buttons stay the same if the prompt is re-sent. Null unless the login is open and has a customer attached.
 */
export async function loginChoices(token: LoginKey, now: Date = new Date()): Promise<string[] | null> {
  const row = await findLogin(token)
  if (!isOpen(row, now) || row.customerId == null) return null
  const stored = row.choices
  if (
    Array.isArray(stored) &&
    stored.length === CHOICES_COUNT &&
    stored.every((c) => typeof c === 'string' && /^\d{4}$/.test(c)) &&
    new Set(stored).size === CHOICES_COUNT &&
    stored.includes(row.checkCode)
  ) {
    return stored as string[]
  }
  const set = new Set([row.checkCode])
  while (set.size < CHOICES_COUNT) set.add(fourDigits())
  const choices = [...set]
  for (let k = choices.length - 1; k > 0; k--) {
    const j = randomInt(0, k + 1)
    ;[choices[k], choices[j]] = [choices[j], choices[k]]
  }
  await prisma.customerLogin.update({ where: { id: row.id }, data: { choices } })
  return choices
}

/**
 * Button pressed in the bot. Only the Telegram user the login is bound to (and whose account it is) may confirm
 * ('mismatch' otherwise, login untouched). A wrong pick cancels the login for good ('wrong_code') and starts this
 * Telegram user's cooldown: for WRONG_PICK_COOLDOWN_MS every pick answers 'cooldown' (login untouched).
 */
export async function confirmLogin(
  token: LoginKey,
  telegramUserId: string,
  pickedCode: string,
  now: Date = new Date(),
): Promise<'ok' | 'expired' | 'mismatch' | 'wrong_code' | 'cooldown'> {
  const row = await findLogin(token)
  if (!isOpen(row, now) || row.customerId == null) return 'expired'
  const tg = String(telegramUserId ?? '')
  if (!tg || row.pendingTelegramUserId !== tg) return 'mismatch'
  const c = await prisma.customer.findUnique({ where: { id: row.customerId }, select: { telegramUserId: true, accountCreatedAt: true } })
  if (!c || !c.accountCreatedAt) return 'expired'
  if (c.telegramUserId !== tg) return 'mismatch'
  if (await inCooldown(tg, now)) return 'cooldown'
  if (!(await safeEqual(String(pickedCode ?? ''), row.checkCode))) {
    // expiresAt := time of the wrong pick (the row is dead anyway): the cooldown is measured from it
    await prisma.customerLogin.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'WRONG_CODE', expiresAt: now } })
    return 'wrong_code'
  }
  const done = await prisma.customerLogin.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'CONFIRMED' } })
  return done.count === 1 ? 'ok' : 'expired'
}

/**
 * Website poll. Only the browser holding the secret from startLogin may collect ('denied' otherwise, checked
 * before anything else is revealed). A confirmed login yields the customer id exactly once; then 'expired'.
 */
export async function collectLogin(
  token: string,
  browserSecret: string,
  now: Date = new Date(),
): Promise<{ customerId: number } | 'pending' | 'expired' | 'denied'> {
  const row = typeof token === 'string' && token ? await findLogin(token) : null
  if (!row) return 'expired'
  if (!(await safeEqual(sha256(typeof browserSecret === 'string' ? browserSecret : ''), row.browserHash))) return 'denied'
  if (row.expiresAt <= now) return 'expired'
  if (row.status === 'PENDING') return 'pending'
  if (row.status !== 'CONFIRMED' || row.customerId == null) return 'expired'
  const used = await prisma.customerLogin.updateMany({ where: { id: row.id, status: 'CONFIRMED' }, data: { status: 'USED' } })
  return used.count === 1 ? { customerId: row.customerId } : 'expired'
}
