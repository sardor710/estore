import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SignJWT } from 'jose'
import { prisma } from '@/lib/db'
import { createSession, readSession } from '@/lib/auth'
import { upsertCustomerFromOrder } from '@/lib/customers'
import {
  CUSTOMER_COOKIE,
  CUSTOMER_SESSION_MAX_AGE,
  createCustomerSession,
  readCustomerSession,
  customerFromToken,
  getAccountCustomer,
  issueCustomerSession,
} from '@/lib/account/session'
import {
  startLogin,
  loginForTelegramUser,
  findPendingLogin,
  linkTelegramContact,
  loginChoices,
  confirmLogin,
  collectLogin,
} from '@/lib/account/login'
import { requestLoginCode, verifyLoginCode, resetCodeLimits } from '@/lib/account/codes'

// next/headers is only available inside a Next request; tests drive the cookie jar directly.
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}))

const SECRET = 's'.repeat(40)
const saved = { ...process.env }
beforeEach(() => {
  process.env.SESSION_SECRET = SECRET
  jar.clear()
  resetCodeLimits()
})
afterEach(() => {
  process.env = { ...saved }
})

const MIN = 60_000
const PHONE = '+998901234567'
const TG = '1001'
const CHAT = '5001'

/** start -> (unknown user) -> own contact -> pick the real code; returns everything a test may need. */
async function signInNewUser(o: { tg?: string; chat?: string; phone?: string; name?: string } = {}) {
  const tg = o.tg ?? TG
  const s = await startLogin()
  expect(await loginForTelegramUser(s.token, tg)).toBe('unknown_user')
  const linked = await linkTelegramContact({
    token: s.token,
    telegramUserId: tg,
    chatId: o.chat ?? CHAT,
    contactUserId: tg,
    phone: o.phone ?? '998901234567',
    name: o.name ?? 'Aziz',
    locale: 'ru',
  })
  expect(linked).toBe('ok')
  expect(await confirmLogin(s.token, tg, s.checkCode)).toBe('ok')
  const r = await collectLogin(s.token, s.browserSecret)
  if (typeof r === 'string') throw new Error(`collect failed: ${r}`)
  return { ...s, customerId: r.customerId }
}

// ---------------------------------------------------------------- session

describe('customer session token', () => {
  it('round-trips { cid, sv }', async () => {
    const t = await createCustomerSession({ cid: 7, sv: 2 })
    expect(await readCustomerSession(t)).toEqual({ cid: 7, sv: 2 })
    expect(CUSTOMER_COOKIE).toBe('customer_session')
    expect(CUSTOMER_SESSION_MAX_AGE).toBe(30 * 24 * 3600)
  })

  it('rejects missing, garbage and tampered tokens, and fails closed without SESSION_SECRET', async () => {
    const t = await createCustomerSession({ cid: 7, sv: 0 })
    expect(await readCustomerSession(null)).toBeNull()
    expect(await readCustomerSession('')).toBeNull()
    expect(await readCustomerSession('abc.def.ghi')).toBeNull()
    expect(await readCustomerSession(t.slice(0, -2) + (t.endsWith('AA') ? 'BB' : 'AA'))).toBeNull()
    delete process.env.SESSION_SECRET
    expect(await readCustomerSession(t)).toBeNull()
    await expect(createCustomerSession({ cid: 1, sv: 0 })).rejects.toThrow()
  })

  it('A11: a staff token is not a customer session', async () => {
    const staff = await createSession({ uid: 1, role: 'ADMIN', sv: 0 })
    expect(await readSession(staff)).not.toBeNull()
    expect(await readCustomerSession(staff)).toBeNull()
  })

  it('A11: a customer token is not a staff session', async () => {
    const cust = await createCustomerSession({ cid: 1, sv: 0 })
    expect(await readSession(cust)).toBeNull()
  })

  it('claims shape is checked on top of the audience (same key, forged payloads)', async () => {
    const key = new TextEncoder().encode(SECRET)
    const sign = (payload: Record<string, unknown>, iss: string, aud: string, sub: string) =>
      new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuer(iss).setAudience(aud).setSubject(sub).setIssuedAt().setExpirationTime('1h').sign(key)
    // customer audience but staff-shaped claims
    expect(await readCustomerSession(await sign({ uid: 1, role: 'ADMIN', sv: 0 }, 'estore-customer', 'customer', '1'))).toBeNull()
    // staff audience with customer-shaped claims
    expect(await readSession(await sign({ cid: 1, sv: 0 }, 'estore-admin', 'estore-admin', '1'))).toBeNull()
    // customer claims under the staff audience are not a customer session either
    expect(await readCustomerSession(await sign({ cid: 1, sv: 0 }, 'estore-admin', 'estore-admin', '1'))).toBeNull()
    // sub must match cid, sv must be a non-negative integer
    expect(await readCustomerSession(await sign({ cid: 1, sv: 0 }, 'estore-customer', 'customer', '2'))).toBeNull()
    expect(await readCustomerSession(await sign({ cid: 1, sv: -1 }, 'estore-customer', 'customer', '1'))).toBeNull()
    expect(await readCustomerSession(await sign({ cid: 1, sv: 0 }, 'estore-customer', 'customer', '1'))).toEqual({ cid: 1, sv: 0 })
  })

  it('alg "none" is refused', async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const now = Math.floor(Date.now() / 1000)
    const t = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ cid: 1, sv: 0, sub: '1', iss: 'estore-customer', aud: 'customer', exp: now + 600 })}.`
    expect(await readCustomerSession(t)).toBeNull()
  })
})

describe('account customer from session', () => {
  it('resolves the signed-in account; bumped sessionVersion or deleted account -> null', async () => {
    const { customerId } = await signInNewUser()
    const token = await issueCustomerSession(customerId)
    expect(token).toBeTypeOf('string')
    const c = await customerFromToken(token)
    expect(c).toEqual({ id: customerId, phone: PHONE, name: 'Aziz', locale: 'ru', notifyTelegram: true, blocked: false })

    jar.set(CUSTOMER_COOKIE, token!)
    expect((await getAccountCustomer())?.id).toBe(customerId)

    await prisma.customer.update({ where: { id: customerId }, data: { sessionVersion: { increment: 1 } } })
    expect(await customerFromToken(token)).toBeNull()
    expect(await getAccountCustomer()).toBeNull()

    const fresh = await issueCustomerSession(customerId)
    expect(await customerFromToken(fresh)).not.toBeNull()
    await prisma.customer.update({ where: { id: customerId }, data: { accountCreatedAt: null } })
    expect(await customerFromToken(fresh)).toBeNull()
    expect(await issueCustomerSession(customerId)).toBeNull()
  })

  it('an order-only Customer (no account) gets no session', async () => {
    const id = await prisma.$transaction((tx) => upsertCustomerFromOrder(tx, { phone: PHONE, name: 'Guest', region: 'tashkent' }))
    expect(await issueCustomerSession(id)).toBeNull()
    expect(await customerFromToken(await createCustomerSession({ cid: id, sv: 0 }))).toBeNull()
  })
})

// ---------------------------------------------------------------- bot sign-in

describe('startLogin', () => {
  it('returns random secrets, a 4-digit check code and a 10-minute expiry; stores only hashes', async () => {
    const now = new Date()
    const a = await startLogin(now)
    const b = await startLogin(now)
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a.browserSecret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a.token).not.toBe(b.token)
    expect(a.checkCode).toMatch(/^\d{4}$/)
    expect(a.expiresAt.getTime() - now.getTime()).toBe(10 * MIN)
    const rows = await prisma.customerLogin.findMany()
    expect(rows).toHaveLength(2)
    const dump = JSON.stringify(rows)
    expect(dump).not.toContain(a.token)
    expect(dump).not.toContain(a.browserSecret)
  })

  it('deletes logins older than 30 days', async () => {
    const now = new Date()
    const old = (days: number) =>
      prisma.customerLogin.create({
        data: { tokenHash: `h${days}`, browserHash: 'b', checkCode: '0000', expiresAt: now, createdAt: new Date(now.getTime() - days * 86_400_000) },
      })
    await old(31)
    await old(29)
    await startLogin(now)
    const left = await prisma.customerLogin.findMany({ select: { tokenHash: true } })
    expect(left.map((r) => r.tokenHash).sort()).toEqual(expect.arrayContaining(['h29']))
    expect(left.map((r) => r.tokenHash)).not.toContain('h31')
    expect(left).toHaveLength(2)
  })
})

describe('first sign-in through the bot', () => {
  it('pending until confirmed, then the customer id exactly once', async () => {
    const s = await startLogin()
    expect(await collectLogin(s.token, s.browserSecret)).toBe('pending')
    expect(await loginForTelegramUser(s.token, TG)).toBe('unknown_user')
    expect(await collectLogin(s.token, s.browserSecret)).toBe('pending')

    let relinked = false
    expect(
      await linkTelegramContact(
        { token: s.token, telegramUserId: TG, chatId: CHAT, contactUserId: TG, phone: '+998 90 123 45 67', name: 'Aziz', locale: 'uz' },
        { onRelinked: () => void (relinked = true) },
      ),
    ).toBe('ok')
    expect(relinked).toBe(false)
    expect(await collectLogin(s.token, s.browserSecret)).toBe('pending')

    expect(await confirmLogin(s.token, TG, s.checkCode)).toBe('ok')
    const r = await collectLogin(s.token, s.browserSecret)
    expect(r).toEqual({ customerId: expect.any(Number) })
    expect(await collectLogin(s.token, s.browserSecret)).toBe('expired')
    expect(await confirmLogin(s.token, TG, s.checkCode)).toBe('expired')

    const c = await prisma.customer.findUniqueOrThrow({ where: { id: (r as { customerId: number }).customerId } })
    expect(c).toMatchObject({ phone: PHONE, telegramUserId: TG, telegramChatId: CHAT, accountLocale: 'uz', name: 'Aziz' })
    expect(c.accountCreatedAt).toBeInstanceOf(Date)
  })

  it('wrong browser secret -> denied (another browser cannot collect)', async () => {
    const s = await signInFlowUntilConfirmed()
    expect(await collectLogin(s.token, 'x'.repeat(43))).toBe('denied')
    expect(await collectLogin(s.token, '')).toBe('denied')
    // the real browser can still collect
    expect(await collectLogin(s.token, s.browserSecret)).toEqual({ customerId: expect.any(Number) })
  })

  it('unknown token -> expired', async () => {
    expect(await collectLogin('nope', 'nope')).toBe('expired')
    expect(await loginForTelegramUser('nope', TG)).toBe('expired')
    expect(await loginChoices('nope')).toBeNull()
    expect(await confirmLogin('nope', TG, '1234')).toBe('expired')
    expect(
      await linkTelegramContact({ token: 'nope', telegramUserId: TG, chatId: CHAT, contactUserId: TG, phone: PHONE, name: 'A' }),
    ).toBe('expired')
  })

  it('after 10 minutes -> expired, even when confirmed', async () => {
    const s = await signInFlowUntilConfirmed()
    expect(await collectLogin(s.token, s.browserSecret, new Date(s.expiresAt.getTime() + 1))).toBe('expired')
    const p = await startLogin(new Date(Date.now() - 11 * MIN))
    expect(await collectLogin(p.token, p.browserSecret)).toBe('expired')
    expect(await loginForTelegramUser(p.token, TG)).toBe('expired')
    expect(
      await linkTelegramContact({ token: p.token, telegramUserId: TG, chatId: CHAT, contactUserId: TG, phone: PHONE, name: 'A' }),
    ).toBe('expired')
  })

  it('forwarded contact (contact.user_id !== from.id) -> not_own_contact, no Customer', async () => {
    const s = await startLogin()
    await loginForTelegramUser(s.token, TG)
    expect(
      await linkTelegramContact({ token: s.token, telegramUserId: TG, chatId: CHAT, contactUserId: '999', phone: PHONE, name: 'X' }),
    ).toBe('not_own_contact')
    expect(
      await linkTelegramContact({ token: s.token, telegramUserId: TG, chatId: CHAT, contactUserId: '', phone: PHONE, name: 'X' }),
    ).toBe('not_own_contact')
    expect(await prisma.customer.count()).toBe(0)
  })

  it('non-UZ phone -> bad_phone, no Customer', async () => {
    const s = await startLogin()
    await loginForTelegramUser(s.token, TG)
    expect(
      await linkTelegramContact({ token: s.token, telegramUserId: TG, chatId: CHAT, contactUserId: TG, phone: '+7 999 123 45 67', name: 'X' }),
    ).toBe('bad_phone')
    expect(await prisma.customer.count()).toBe(0)
  })

  it('a phone with earlier orders gets the same Customer row (orders link), name and region kept', async () => {
    const id = await prisma.$transaction((tx) => upsertCustomerFromOrder(tx, { phone: PHONE, name: 'Order Name', region: 'samarkand' }))
    const { customerId } = await signInNewUser({ name: 'Telegram Name' })
    expect(customerId).toBe(id)
    const c = await prisma.customer.findUniqueOrThrow({ where: { id } })
    expect(c).toMatchObject({ name: 'Order Name', region: 'samarkand', telegramUserId: TG })
    expect(await prisma.customer.count()).toBe(1)
    // and orders still upsert onto it afterwards without touching the account
    await prisma.$transaction((tx) => upsertCustomerFromOrder(tx, { phone: PHONE, name: 'Newer', region: 'tashkent' }))
    // the account holder's own name is kept (recipient names of later orders do not overwrite it); region follows
    expect(await prisma.customer.findUniqueOrThrow({ where: { id } })).toMatchObject({ telegramUserId: TG, name: 'Order Name', region: 'tashkent' })
  })

  it('a second Telegram account for the same phone relinks, revokes old sessions and reports the old chat', async () => {
    const first = await signInNewUser({ tg: '1001', chat: '5001' })
    const oldToken = await issueCustomerSession(first.customerId)
    expect(await customerFromToken(oldToken)).not.toBeNull()

    const s = await startLogin()
    expect(await loginForTelegramUser(s.token, '2002')).toBe('unknown_user')
    const onRelinked = vi.fn()
    expect(
      await linkTelegramContact(
        { token: s.token, telegramUserId: '2002', chatId: '6002', contactUserId: '2002', phone: PHONE, name: 'New' },
        { onRelinked },
      ),
    ).toBe('ok')
    expect(onRelinked).toHaveBeenCalledWith('5001')
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: first.customerId } })
    expect(c).toMatchObject({ telegramUserId: '2002', telegramChatId: '6002', sessionVersion: 1 })
    expect(await customerFromToken(oldToken)).toBeNull()

    expect(await confirmLogin(s.token, '2002', s.checkCode)).toBe('ok')
    expect(await collectLogin(s.token, s.browserSecret)).toEqual({ customerId: first.customerId })
    // the old Telegram user is no longer a known user
    const again = await startLogin()
    expect(await loginForTelegramUser(again.token, '1001')).toBe('unknown_user')
  })

  it('a Telegram user moving to a new phone releases the old phone account', async () => {
    const a = await signInNewUser({ phone: '998901111111' })
    const tokenA = await issueCustomerSession(a.customerId)
    // same Telegram user shares a contact with a new number (e.g. changed number in Telegram)
    const s = await startLogin()
    expect(await loginForTelegramUser(s.token, TG)).toEqual({ checkCode: s.checkCode, loginId: expect.any(Number) })
    expect(
      await linkTelegramContact({ token: s.token, telegramUserId: TG, chatId: CHAT, contactUserId: TG, phone: '998902222222', name: 'A' }),
    ).toBe('ok')
    expect(await confirmLogin(s.token, TG, s.checkCode)).toBe('ok')
    const b = await collectLogin(s.token, s.browserSecret)
    expect(b).toEqual({ customerId: expect.any(Number) })
    expect((b as { customerId: number }).customerId).not.toBe(a.customerId)
    const old = await prisma.customer.findUniqueOrThrow({ where: { id: a.customerId } })
    expect(old.telegramUserId).toBeNull()
    expect(old.telegramChatId).toBeNull()
    expect(old.accountCreatedAt).toBeNull() // no longer an account: admin badge / account state stay honest
    expect(await customerFromToken(tokenA)).toBeNull()
  })

  it('confirm by a different Telegram user -> mismatch, login stays pending', async () => {
    const s = await startLogin()
    await loginForTelegramUser(s.token, TG)
    await linkTelegramContact({ token: s.token, telegramUserId: TG, chatId: CHAT, contactUserId: TG, phone: PHONE, name: 'A' })
    expect(await confirmLogin(s.token, '666', s.checkCode)).toBe('mismatch')
    expect(await collectLogin(s.token, s.browserSecret)).toBe('pending')
    expect(await confirmLogin(s.token, TG, s.checkCode)).toBe('ok')
  })

  it('a link already opened by one Telegram user cannot be taken over by another', async () => {
    const s = await startLogin()
    expect(await loginForTelegramUser(s.token, TG)).toBe('unknown_user')
    expect(await loginForTelegramUser(s.token, '666')).toBe('expired')
    expect(
      await linkTelegramContact({ token: s.token, telegramUserId: '666', chatId: '1', contactUserId: '666', phone: PHONE, name: 'A' }),
    ).toBe('expired')
    expect(await prisma.customer.count()).toBe(0)
  })

  it('wrong picked code -> wrong_code and the login is cancelled', async () => {
    const s = await startLogin()
    await loginForTelegramUser(s.token, TG)
    await linkTelegramContact({ token: s.token, telegramUserId: TG, chatId: CHAT, contactUserId: TG, phone: PHONE, name: 'A' })
    const decoy = (await loginChoices(s.token))!.find((c) => c !== s.checkCode)!
    expect(await confirmLogin(s.token, TG, decoy)).toBe('wrong_code')
    expect(await collectLogin(s.token, s.browserSecret)).toBe('expired')
    expect(await confirmLogin(s.token, TG, s.checkCode)).toBe('expired')
  })

  it('loginChoices: 6 distinct 4-digit codes (1 real + 5 decoys), stable per login', async () => {
    for (let i = 0; i < 5; i++) {
      const s = await startLogin()
      await loginForTelegramUser(s.token, TG)
      await linkTelegramContact({ token: s.token, telegramUserId: TG, chatId: CHAT, contactUserId: TG, phone: PHONE, name: 'A' })
      const c = await loginChoices(s.token)
      expect(c).toHaveLength(6)
      expect(new Set(c).size).toBe(6)
      for (const x of c!) expect(x).toMatch(/^\d{4}$/)
      expect(c).toContain(s.checkCode)
      expect(await loginChoices(s.token)).toEqual(c)
    }
  })

  it('Telegram contact phone must be a full +998 number: short/foreign numbers -> bad_phone (no 9-digit shortcut)', async () => {
    for (const phone of ['298123456', '+376123456', '901234567']) {
      const s = await startLogin()
      await loginForTelegramUser(s.token, TG)
      expect(await linkTelegramContact({ token: s.token, telegramUserId: TG, chatId: CHAT, contactUserId: TG, phone, name: 'X' })).toBe('bad_phone')
    }
    expect(await prisma.customer.count()).toBe(0)
    for (const phone of ['998901234567', '+998 90 123 45 67']) {
      const s = await startLogin()
      await loginForTelegramUser(s.token, TG)
      expect(await linkTelegramContact({ token: s.token, telegramUserId: TG, chatId: CHAT, contactUserId: TG, phone, name: 'X' })).toBe('ok')
    }
    expect(await prisma.customer.count({ where: { phone: PHONE } })).toBe(1)
  })

  it('after a wrong pick the same Telegram user cannot start or confirm another login for 60 seconds', async () => {
    await signInNewUser()
    const T = new Date(Date.now() + 1000)
    const sec = (n: number) => new Date(T.getTime() + n * 1000)
    // a second login, opened before the wrong pick
    const parallel = await startLogin(T)
    expect(await loginForTelegramUser(parallel.token, TG, T)).toMatchObject({ checkCode: parallel.checkCode })
    const s = await startLogin(T)
    await loginForTelegramUser(s.token, TG, T)
    const decoy = (await loginChoices(s.token, T))!.find((c) => c !== s.checkCode)!
    expect(await confirmLogin(s.token, TG, decoy, sec(1))).toBe('wrong_code')

    expect(await confirmLogin(parallel.token, TG, parallel.checkCode, sec(30))).toBe('cooldown')
    const next = await startLogin(sec(30))
    expect(await loginForTelegramUser(next.token, TG, sec(30))).toBe('cooldown')
    // another Telegram user is not affected
    const other = await startLogin(sec(30))
    expect(await loginForTelegramUser(other.token, '777', sec(30))).toBe('unknown_user')
    // a minute after the wrong pick it works again
    const later = await startLogin(sec(62))
    expect(await loginForTelegramUser(later.token, TG, sec(62))).toMatchObject({ checkCode: later.checkCode })
    expect(await confirmLogin(later.token, TG, later.checkCode, sec(62))).toBe('ok')
    expect(await confirmLogin(parallel.token, TG, parallel.checkCode, sec(62))).toBe('ok')
  })

  it('choices / confirm are not offered before a customer is attached', async () => {
    const s = await startLogin()
    await loginForTelegramUser(s.token, TG)
    expect(await loginChoices(s.token)).toBeNull()
    expect(await confirmLogin(s.token, TG, s.checkCode)).toBe('expired')
  })

  it('returning Telegram user: start -> check code -> confirm, no contact needed', async () => {
    const first = await signInNewUser()
    const s = await startLogin()
    expect(await loginForTelegramUser(s.token, TG)).toEqual({ checkCode: s.checkCode, loginId: expect.any(Number) })
    expect(await loginChoices(s.token)).toContain(s.checkCode)
    expect(await confirmLogin(s.token, TG, s.checkCode)).toBe('ok')
    expect(await collectLogin(s.token, s.browserSecret)).toEqual({ customerId: first.customerId })
  })

  it('bot steps after /start can address the login by id (contact message carries no token)', async () => {
    const s = await startLogin()
    expect(await findPendingLogin(TG)).toBeNull()
    await loginForTelegramUser(s.token, TG)
    const id = await findPendingLogin(TG)
    expect(id).toEqual(expect.any(Number))
    expect(await findPendingLogin('someone-else')).toBeNull()
    expect(
      await linkTelegramContact({ token: { id: id! }, telegramUserId: TG, chatId: CHAT, contactUserId: TG, phone: PHONE, name: 'A' }),
    ).toBe('ok')
    expect(await loginChoices({ id: id! })).toContain(s.checkCode)
    expect(await confirmLogin({ id: id! }, TG, s.checkCode)).toBe('ok')
    expect(await findPendingLogin(TG)).toBeNull()
    expect(await collectLogin(s.token, s.browserSecret)).toEqual({ customerId: expect.any(Number) })
  })
})

async function signInFlowUntilConfirmed() {
  const s = await startLogin()
  await loginForTelegramUser(s.token, TG)
  await linkTelegramContact({ token: s.token, telegramUserId: TG, chatId: CHAT, contactUserId: TG, phone: PHONE, name: 'A' })
  expect(await confirmLogin(s.token, TG, s.checkCode)).toBe('ok')
  return s
}

// ---------------------------------------------------------------- 6-digit codes

describe('login codes', () => {
  const T0 = new Date('2026-11-17T08:00:00Z')
  const at = (min: number) => new Date(T0.getTime() + min * MIN)
  const capture = () => {
    const sent: { chatId: string; text: string }[] = []
    const send = vi.fn(async (chatId: string, text: string) => {
      sent.push({ chatId, text })
      return true
    })
    const lastCode = () => sent.at(-1)!.text.match(/\b(\d{6})\b/)![1]
    return { sent, send, lastCode }
  }

  it('bad phone -> bad_phone; unlinked phone -> not_linked, nothing sent', async () => {
    const { send } = capture()
    expect(await requestLoginCode('+7 999 123 45 67', 'ip1', send, T0)).toBe('bad_phone')
    expect(await requestLoginCode(PHONE, 'ip1', send, T0)).toBe('not_linked')
    // an order-only customer is not linked either
    await prisma.$transaction((tx) => upsertCustomerFromOrder(tx, { phone: PHONE, name: 'G', region: 'tashkent' }))
    expect(await requestLoginCode(PHONE, 'ip1', send, T0)).toBe('not_linked')
    expect(send).not.toHaveBeenCalled()
    expect(await prisma.customerLoginCode.count()).toBe(0)
  })

  it('sends a 6-digit code to the linked chat; verify succeeds exactly once', async () => {
    const { customerId } = await signInNewUser()
    const { send, sent, lastCode } = capture()
    expect(await requestLoginCode('90 123 45 67', 'ip1', send, T0)).toBe('sent')
    expect(sent).toHaveLength(1)
    expect(sent[0].chatId).toBe(CHAT)
    const code = lastCode()
    expect(code).toMatch(/^\d{6}$/)
    expect(JSON.stringify(await prisma.customerLoginCode.findMany())).not.toContain(code)
    expect(await verifyLoginCode('+998 90 123 45 67', code, at(1))).toEqual({ customerId })
    expect(await verifyLoginCode(PHONE, code, at(1))).toBe('invalid')
  })

  it('code expires after 5 minutes', async () => {
    await signInNewUser()
    const { send, lastCode } = capture()
    await requestLoginCode(PHONE, 'ip1', send, T0)
    expect(await verifyLoginCode(PHONE, lastCode(), at(5.01))).toBe('expired')
  })

  it('5 wrong attempts kill the code', async () => {
    await signInNewUser()
    const { send, lastCode } = capture()
    await requestLoginCode(PHONE, 'ip1', send, T0)
    const code = lastCode()
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 4; i++) expect(await verifyLoginCode(PHONE, wrong, at(1))).toBe('invalid')
    expect(await verifyLoginCode(PHONE, wrong, at(1))).toBe('too_many_attempts')
    expect(await verifyLoginCode(PHONE, code, at(1))).toBe('too_many_attempts')
  })

  it('malformed or unknown input -> invalid', async () => {
    await signInNewUser()
    expect(await verifyLoginCode(PHONE, '123456', T0)).toBe('invalid') // no code issued
    expect(await verifyLoginCode('nonsense', '123456', T0)).toBe('invalid')
    const { send } = capture()
    await requestLoginCode(PHONE, 'ip1', send, T0)
    expect(await verifyLoginCode(PHONE, '12a456', at(1))).toBe('invalid')
    expect(await verifyLoginCode(PHONE, '', at(1))).toBe('invalid')
  })

  it('a new code replaces the previous one', async () => {
    await signInNewUser()
    const { send, lastCode } = capture()
    await requestLoginCode(PHONE, 'ip1', send, T0)
    const first = lastCode()
    await requestLoginCode(PHONE, 'ip1', send, at(1))
    const second = lastCode()
    if (first !== second) expect(await verifyLoginCode(PHONE, first, at(2))).toBe('invalid')
    expect(await verifyLoginCode(PHONE, second, at(2))).toEqual({ customerId: expect.any(Number) })
  })

  it('4th request for a phone within 15 minutes -> phone_limited (DB-based), allowed again later', async () => {
    await signInNewUser()
    const { send } = capture()
    for (let i = 0; i < 3; i++) expect(await requestLoginCode(PHONE, `ip-${i}`, send, at(i))).toBe('sent')
    expect(await requestLoginCode(PHONE, 'ip-x', send, at(3))).toBe('phone_limited')
    resetCodeLimits() // a restart must not reset the per-phone limit
    expect(await requestLoginCode(PHONE, 'ip-y', send, at(4))).toBe('phone_limited')
    expect(await requestLoginCode(PHONE, 'ip-z', send, at(16))).toBe('sent')
    expect(send).toHaveBeenCalledTimes(4)
  })

  it('at most 10 codes per phone per day', async () => {
    await signInNewUser()
    const { send } = capture()
    for (let i = 0; i < 10; i++) expect(await requestLoginCode(PHONE, `ip-${i}`, send, at(i * 20))).toBe('sent')
    expect(await requestLoginCode(PHONE, 'ip-x', send, at(10 * 20))).toBe('phone_limited')
    expect(await requestLoginCode(PHONE, 'ip-x', send, at(24 * 60 + 1))).toBe('sent')
  })

  it('at most 10 requests per IP per 15 minutes (any phone, linked or not)', async () => {
    const { send } = capture()
    for (let i = 0; i < 10; i++) expect(await requestLoginCode(`+99890000000${i}`, 'ip-1', send, at(0))).toBe('not_linked')
    expect(await requestLoginCode('+998900000010', 'ip-1', send, at(1))).toBe('rate_limited')
    expect(await requestLoginCode('+998900000010', 'ip-2', send, at(1))).toBe('not_linked')
    expect(await requestLoginCode('+998900000010', 'ip-1', send, at(16))).toBe('not_linked')
  })

  it("without TRUST_PROXY every client shares the key 'shared': it gets a much larger allowance than one IP", async () => {
    const { send } = capture()
    for (let i = 0; i < 50; i++) expect(await requestLoginCode(`+9989000${String(i).padStart(5, '0')}`, 'shared', send, at(0))).toBe('not_linked')
  })

  it('schedule option: limits are checked now, the Telegram send runs in the scheduled task; a failed send burns the code', async () => {
    await signInNewUser()
    const tasks: (() => Promise<unknown>)[] = []
    const schedule = (t: () => Promise<unknown>) => void tasks.push(t)
    let code = ''
    const failing = vi.fn(async (_chat: string, text: string) => {
      code = text.match(/\b(\d{6})\b/)![1]
      return false
    })
    expect(await requestLoginCode(PHONE, 'ip1', failing, T0, { schedule })).toBe('sent')
    expect(failing).not.toHaveBeenCalled()
    expect(tasks).toHaveLength(1)
    await tasks[0]()
    expect(failing).toHaveBeenCalledTimes(1)
    expect(await verifyLoginCode(PHONE, code, at(1))).toBe('invalid')
    // unlinked phones schedule nothing
    expect(await requestLoginCode('+998907777777', 'ip1', failing, T0, { schedule })).toBe('not_linked')
    expect(tasks).toHaveLength(1)
  })

  it('send returns false or throws -> send_failed and the code is unusable', async () => {
    await signInNewUser()
    let code = ''
    const failing = vi.fn(async (_chat: string, text: string) => {
      code = text.match(/\b(\d{6})\b/)![1]
      return false
    })
    expect(await requestLoginCode(PHONE, 'ip1', failing, T0)).toBe('send_failed')
    expect(await verifyLoginCode(PHONE, code, at(1))).toBe('invalid')
    const throwing = vi.fn(async () => {
      throw new Error('telegram down')
    })
    expect(await requestLoginCode(PHONE, 'ip1', throwing, at(1))).toBe('send_failed')
  })

  it('code text follows the account language', async () => {
    await signInNewUser() // locale 'ru'
    const { send, sent } = capture()
    await requestLoginCode(PHONE, 'ip1', send, T0)
    expect(sent[0].text).toMatch(/[А-Яа-я]/)
  })
})
