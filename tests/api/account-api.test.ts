import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { NextRequest, type NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { updateSettings } from '@/lib/settings'
import { CUSTOMER_COOKIE, createCustomerSession, customerFromToken } from '@/lib/account/session'
import { loginForTelegramUser, confirmLogin } from '@/lib/account/login'
import { resetCodeLimits } from '@/lib/account/codes'
import { safeNext } from '@/lib/account/next'
import { SESSION_COOKIE } from '@/lib/auth'
import { resetOrderThrottle } from '@/lib/order-throttle'

// Server actions read the request cookie jar via next/headers; route handlers read req.cookies.
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string, opts?: { maxAge?: number }) => void (opts?.maxAge === 0 ? jar.delete(name) : jar.set(name, value)),
    delete: (name: string) => void jar.delete(name),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { POST: startPOST } = await import('@/app/api/account/login/start/route')
const { GET: statusGET } = await import('@/app/api/account/login/status/route')
const { POST: codePOST } = await import('@/app/api/account/login/code/route')
const { POST: verifyPOST } = await import('@/app/api/account/login/verify/route')
const { POST: logoutPOST } = await import('@/app/api/account/logout/route')
const { resetAccountApiLimits } = await import('@/app/api/account/_lib')
const { POST: orderPOST } = await import('@/app/api/orders/route')
const { GET: adminOrdersGET } = await import('@/app/api/admin/orders/route')
const actions = await import('@/app/[locale]/account/actions')

const ORIGIN = 'http://localhost:3000'
const PHONE = '+998901234567'

type Sent = { url: string; body: Record<string, unknown> }
let sent: Sent[] = []
let telegramUp = true

const saved = { ...process.env }
beforeEach(async () => {
  process.env.SESSION_SECRET = 'k'.repeat(40)
  process.env.SITE_URL = ORIGIN
  process.env.TRUST_PROXY = '1'
  jar.clear()
  resetCodeLimits()
  resetAccountApiLimits()
  resetOrderThrottle()
  sent = []
  telegramUp = true
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)) })
    if (!telegramUp) throw new Error('down')
    return new Response(JSON.stringify({ ok: true, result: { username: 'shopbot', message_id: 1 } }), { status: 200 })
  })
  await updateSettings({ telegramBotToken: '123:abc' })
})
afterEach(() => {
  process.env = { ...saved }
  vi.unstubAllGlobals()
})

function req(path: string, o: { method?: string; body?: unknown; cookies?: Record<string, string>; origin?: string | null; ip?: string } = {}) {
  const headers: Record<string, string> = { host: 'localhost:3000', 'x-forwarded-for': o.ip ?? '9.9.9.9' }
  if (o.origin !== null) headers.origin = o.origin ?? ORIGIN
  if (o.body !== undefined) headers['content-type'] = 'application/json'
  if (o.cookies) headers.cookie = Object.entries(o.cookies).map(([k, v]) => `${k}=${v}`).join('; ')
  return new NextRequest(`${ORIGIN}${path}`, {
    method: o.method ?? 'POST',
    headers,
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  })
}
const cookieOf = (res: Response, name: string) => (res as NextResponse).cookies.get(name)

async function mkAccount(phone = PHONE, tg = 'tg1', chat = '777') {
  return prisma.customer.create({
    data: { phone, name: 'Aziz', region: '', tags: [], telegramUserId: tg, telegramChatId: chat, accountLocale: 'uz', accountCreatedAt: new Date() },
  })
}
const sessionFor = async (c: { id: number; sessionVersion: number }) => createCustomerSession({ cid: c.id, sv: c.sessionVersion })

async function start() {
  const res = await startPOST(req('/api/account/login/start'))
  expect(res.status).toBe(200)
  const body = await res.json()
  const token = /start=login_([A-Za-z0-9_-]+)$/.exec(body.deepLink)![1]
  const loginCookie = cookieOf(res, 'customer_login')!.value
  return { res, body, token, loginCookie }
}

// ---------------------------------------------------------------- start

describe('POST /api/account/login/start', () => {
  it('returns check code, deep link and QR; token only inside the deep link; browser cookie set', async () => {
    const { res, body, token, loginCookie } = await start()
    expect(Object.keys(body).sort()).toEqual(['checkCode', 'deepLink', 'expiresAt', 'qrSvg'])
    expect(body.checkCode).toMatch(/^\d{4}$/)
    expect(body.deepLink).toMatch(/^https:\/\/t\.me\/shopbot\?start=login_[A-Za-z0-9_-]{43}$/)
    expect(body.deepLink.length - 'https://t.me/shopbot?start='.length).toBeLessThanOrEqual(64)
    expect(body.qrSvg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/)
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 9 * 60_000)
    const c = cookieOf(res, 'customer_login')!
    expect(c).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/api/account/login', maxAge: 600 })
    expect(loginCookie.startsWith(`${token}.`)).toBe(true)
    // only hashes stored
    const row = await prisma.customerLogin.findFirstOrThrow()
    expect(row.tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(JSON.stringify(row)).not.toContain(token)
  })

  it('cross-origin -> 403, no login row', async () => {
    const res = await startPOST(req('/api/account/login/start', { origin: 'https://evil.example' }))
    expect(res.status).toBe(403)
    expect(await prisma.customerLogin.count()).toBe(0)
  })

  it('bot not configured -> 503 BOT_NOT_CONFIGURED', async () => {
    await prisma.setting.deleteMany()
    const res = await startPOST(req('/api/account/login/start'))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'BOT_NOT_CONFIGURED' })
    expect(await prisma.customerLogin.count()).toBe(0)
  })

  it('rate limit: 20 per IP per 10 minutes', async () => {
    for (let i = 0; i < 20; i++) expect((await startPOST(req('/api/account/login/start'))).status).toBe(200)
    expect((await startPOST(req('/api/account/login/start'))).status).toBe(429)
    expect((await startPOST(req('/api/account/login/start', { ip: '8.8.8.8' }))).status).toBe(200)
  })

  it("without TRUST_PROXY (key 'shared') the limit is not one tiny global bucket", async () => {
    delete process.env.TRUST_PROXY
    for (let i = 0; i < 60; i++) expect((await startPOST(req('/api/account/login/start', { ip: `10.0.0.${i}` }))).status).toBe(200)
  })
})

// ---------------------------------------------------------------- status

describe('GET /api/account/login/status', () => {
  it('pending -> done only for the browser holding the login cookie; single use', async () => {
    const c = await mkAccount()
    const { body, token, loginCookie } = await start()
    const poll = (cookie?: string) => statusGET(req('/api/account/login/status', { method: 'GET', origin: null, cookies: cookie ? { customer_login: cookie } : undefined }))

    expect(await (await poll()).json()).toEqual({ state: 'expired' })
    expect(await (await poll(loginCookie)).json()).toEqual({ state: 'pending' })
    expect((await prisma.customer.findUnique({ where: { id: c.id } }))?.lastLoginAt).toBeNull()

    // bot side: returning user opens the link and picks the right code
    expect(await loginForTelegramUser(token, 'tg1')).toMatchObject({ checkCode: body.checkCode })
    expect(await confirmLogin(token, 'tg1', body.checkCode)).toBe('ok')

    // another browser (same token, different secret) gets nothing
    const thief = await poll(`${token}.${'x'.repeat(43)}`)
    expect(await thief.json()).toEqual({ state: 'denied' })
    expect(cookieOf(thief, CUSTOMER_COOKIE)).toBeUndefined()

    const before = Date.now()
    const done = await poll(loginCookie)
    expect(await done.json()).toEqual({ state: 'done' })
    // the sign-in is stamped on the customer (dashboard "Recent sign-ins")
    const stamped = await prisma.customer.findUnique({ where: { id: c.id }, select: { lastLoginAt: true, lastSeenAt: true } })
    expect(stamped!.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(before)
    expect(stamped!.lastLoginAt!.getTime()).toBeLessThanOrEqual(Date.now())
    expect(stamped!.lastSeenAt).toEqual(stamped!.lastLoginAt)
    const session = cookieOf(done, CUSTOMER_COOKIE)!
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
    expect((await customerFromToken(session.value))?.id).toBe(c.id)
    expect(cookieOf(done, 'customer_login')).toMatchObject({ value: '', maxAge: 0, path: '/api/account/login' })

    const again = await poll(loginCookie)
    expect(await again.json()).toEqual({ state: 'expired' })
    expect(cookieOf(again, CUSTOMER_COOKIE)).toBeUndefined()
  })

  it('rate limit: 60 polls per minute per login cookie (not per IP); no cookie -> expired, never limited', async () => {
    const poll = (cookie?: string) => statusGET(req('/api/account/login/status', { method: 'GET', origin: null, cookies: cookie ? { customer_login: cookie } : undefined }))
    const a = await start()
    const b = await start()
    for (let i = 0; i < 60; i++) expect((await poll(a.loginCookie)).status).toBe(200)
    expect((await poll(a.loginCookie)).status).toBe(429)
    // same IP, another sign-in: unaffected
    expect(await (await poll(b.loginCookie)).json()).toEqual({ state: 'pending' })
    // requests without a (valid) cookie are answered cheaply and never counted
    for (let i = 0; i < 200; i++) expect((await poll()).status).toBe(200)
    expect(await (await poll('garbage')).json()).toEqual({ state: 'expired' })
  })
})

// ---------------------------------------------------------------- code + verify

describe('code sign-in', () => {
  const code = (phone: string, o: { ip?: string; origin?: string } = {}) => codePOST(req('/api/account/login/code', { body: { phone }, ...o }))
  const verify = (phone: string, c: string, o: { ip?: string } = {}) => verifyPOST(req('/api/account/login/verify', { body: { phone, code: c }, ...o }))
  const lastCode = () => /\b(\d{6})\b/.exec(String(sent.filter((s) => s.url.endsWith('/sendMessage')).at(-1)!.body.text))![1]

  it('linked and unlinked phones get the identical response (status, body, minimum duration)', async () => {
    await mkAccount()
    const t0 = Date.now()
    const linked = await code('90 123 45 67')
    const t1 = Date.now()
    const unlinked = await code('+998 90 765 43 21')
    const t2 = Date.now()
    expect(linked.status).toBe(200)
    expect(unlinked.status).toBe(200)
    expect(await linked.text()).toBe(await unlinked.text())
    expect(t1 - t0).toBeGreaterThanOrEqual(550)
    expect(t2 - t1).toBeGreaterThanOrEqual(550)
    await new Promise((r) => setTimeout(r, 50)) // the Telegram send runs after the response
    expect(sent.filter((s) => s.url.endsWith('/sendMessage'))).toHaveLength(1)
    expect(sent.at(-1)!.body.chat_id).toBe('777')
  })

  it('per-phone limit is invisible: a linked phone\'s 4th request answers exactly like an unlinked phone (no 429)', async () => {
    await mkAccount()
    for (let i = 0; i < 3; i++) expect((await code(PHONE, { ip: `10.0.0.${i}` })).status).toBe(200)
    const limited = await code(PHONE, { ip: '10.0.0.9' })
    const unlinked = await code('+998 90 765 43 21', { ip: '10.0.0.9' })
    expect(limited.status).toBe(200)
    expect(await limited.text()).toBe(await unlinked.text())
    await new Promise((r) => setTimeout(r, 50))
    expect(sent.filter((s) => s.url.endsWith('/sendMessage'))).toHaveLength(3) // no 4th code was issued
  })

  it('happy path: code -> verify sets the session cookie; code is single-use', async () => {
    const c = await mkAccount()
    expect((await code(PHONE)).status).toBe(200)
    const before = Date.now()
    const res = await verify(PHONE, lastCode())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    const stamped = (await prisma.customer.findUnique({ where: { id: c.id } }))!.lastLoginAt!
    expect(stamped.getTime()).toBeGreaterThanOrEqual(before)
    expect(stamped.getTime()).toBeLessThanOrEqual(Date.now())
    expect((await customerFromToken(cookieOf(res, CUSTOMER_COOKIE)!.value))?.id).toBe(c.id)
    const again = await verify(PHONE, lastCode())
    expect(again.status).toBe(400)
    expect(cookieOf(again, CUSTOMER_COOKIE)).toBeUndefined()
  })

  it('a failing sign-in stamp does not fail the sign-in', async () => {
    const c = await mkAccount()
    await code(PHONE)
    const spy = vi.spyOn(prisma.customer, 'updateMany').mockRejectedValueOnce(new Error('db busy') as never)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const res = await verify(PHONE, lastCode())
      expect(res.status).toBe(200)
      expect((await customerFromToken(cookieOf(res, CUSTOMER_COOKIE)!.value))?.id).toBe(c.id)
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
      errors.mockRestore()
    }
  })

  it('5 wrong codes -> too_many_attempts, even the right code is then refused', async () => {
    await mkAccount()
    await code(PHONE)
    const right = lastCode()
    const wrong = right === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) expect(await (await verify(PHONE, wrong)).json()).toEqual({ error: 'invalid' })
    // locked: even the right code is refused, with the same answer (no account enumeration via verify)
    const locked = await verify(PHONE, right)
    expect(locked.status).toBe(400)
    expect(await locked.json()).toEqual({ error: 'invalid' })
    expect(cookieOf(locked, CUSTOMER_COOKIE)).toBeUndefined()
    expect((await prisma.customer.findFirst({ where: { phone: PHONE } }))?.lastLoginAt).toBeNull() // a failed sign-in is not a sign-in
  })

  it('verify: expired, unknown and malformed codes all answer 400 { error: "invalid" }', async () => {
    await mkAccount()
    await code(PHONE)
    const right = lastCode()
    await prisma.customerLoginCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    const expired = await verify(PHONE, right)
    expect(expired.status).toBe(400)
    expect(await expired.json()).toEqual({ error: 'invalid' })
    expect(await (await verify('+998 90 765 43 21', '123456')).json()).toEqual({ error: 'invalid' })
    expect(await (await verify(PHONE, 'abc')).json()).toEqual({ error: 'invalid' })
  })

  it('bad phone -> 400 BAD_PHONE; Telegram unreachable -> same 200 { ok: true } (sent after the response); IP limit -> 429', async () => {
    await mkAccount()
    const bad = await code('+7 999 123 45 67')
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'BAD_PHONE' })
    telegramUp = false
    const t0 = Date.now()
    const down = await code(PHONE)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(550)
    expect(down.status).toBe(200)
    expect(await down.json()).toEqual({ ok: true })
    await new Promise((r) => setTimeout(r, 50))
    expect(sent.filter((s) => s.url.endsWith('/sendMessage'))).toHaveLength(1)
    // the failed send burnt the code
    expect(await prisma.customerLoginCode.count({ where: { usedAt: null } })).toBe(0)
    resetCodeLimits()
    for (let i = 0; i < 10; i++) await code('+7 1', { ip: '5.5.5.5' })
    expect((await code(PHONE, { ip: '5.5.5.5' })).status).toBe(429)
  })

  it("without TRUST_PROXY (key 'shared') code and verify keep working past the per-IP caps", async () => {
    delete process.env.TRUST_PROXY
    for (let i = 0; i < 12; i++) expect((await code(`+99890100${String(i).padStart(4, '0')}`)).status).toBe(200)
    for (let i = 0; i < 25; i++) expect((await verify(PHONE, '123456')).status).toBe(400)
  }, 30_000)

  it('verify rate limit: 20 per IP per 15 minutes', async () => {
    for (let i = 0; i < 20; i++) await verify(PHONE, '123456', { ip: '6.6.6.6' })
    const r = await verify(PHONE, '123456', { ip: '6.6.6.6' })
    expect(r.status).toBe(429)
  })

  it('cross-origin POSTs -> 403 (code, verify, logout)', async () => {
    await mkAccount()
    expect((await code(PHONE, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await verifyPOST(req('/api/account/login/verify', { body: { phone: PHONE, code: '123456' }, origin: 'https://evil.example' }))).status).toBe(403)
    expect((await logoutPOST(req('/api/account/logout', { body: {}, origin: 'https://evil.example' }))).status).toBe(403)
    expect(sent.filter((s) => s.url.endsWith('/sendMessage'))).toHaveLength(0)
  })
})

// ---------------------------------------------------------------- logout

describe('POST /api/account/logout', () => {
  it('clears the cookie; everywhere=true also revokes all sessions', async () => {
    const c = await mkAccount()
    const token = await sessionFor(c)
    const plain = await logoutPOST(req('/api/account/logout', { cookies: { [CUSTOMER_COOKIE]: token } }))
    expect(plain.status).toBe(200)
    expect(cookieOf(plain, CUSTOMER_COOKIE)).toMatchObject({ value: '', maxAge: 0 })
    expect(await customerFromToken(token)).not.toBeNull() // plain sign-out: other devices stay signed in
    const all = await logoutPOST(req('/api/account/logout', { body: { everywhere: true }, cookies: { [CUSTOMER_COOKIE]: token } }))
    expect(all.status).toBe(200)
    expect(await customerFromToken(token)).toBeNull()
  })
})

// ---------------------------------------------------------------- safeNext

describe('safeNext', () => {
  it.each(['//evil.com', '/\\evil', '/ru/\\evil', 'https://x', 'javascript:x', '/account', '/de/account', '/uzbek', '/ru//evil.com', '', 'ru/account', '/ru/a\nb'])(
    'rejects %j',
    (n) => {
      expect(safeNext(n, 'ru')).toBe('/ru/account')
    },
  )
  it('accepts locale paths and defaults for null/undefined', () => {
    expect(safeNext('/ru/account/orders', 'uz')).toBe('/ru/account/orders')
    expect(safeNext('/uz', 'ru')).toBe('/uz')
    expect(safeNext('/en/product/x-1?ref=fav', 'uz')).toBe('/en/product/x-1?ref=fav')
    expect(safeNext(null, 'en')).toBe('/en/account')
    expect(safeNext(undefined, 'uz')).toBe('/uz/account')
  })
})

// ---------------------------------------------------------------- checkout integration

async function mkVariant() {
  const cat = await prisma.category.create({ data: { slug: 'c', name: { en: 'c' } } })
  const p = await prisma.product.create({
    data: {
      slug: 'p', categoryId: cat.id, status: 'PUBLISHED', title: { en: 'T' }, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [],
      highlights: [], inTheBox: [], faq: [], specs: [], images: ['https://img/p.jpg'], reviewed: { uz: false, ru: false },
      variants: { create: [{ sku: 'V1', name: { en: 'Black' }, priceUzs: 1_000_000, stock: 50 }] },
    },
    include: { variants: true },
  })
  return { product: p, variant: p.variants[0] }
}

describe('POST /api/orders with a customer session', () => {
  const form = { name: 'Aziz Karimov', region: 'tashkent-city', address: 'Amir Temur 1', locale: 'uz' }
  const order = (body: Record<string, unknown>, cookie?: string) =>
    orderPOST(
      new Request(`${ORIGIN}/api/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      }) as never,
    )

  it("an order for someone else (recipient 'Mom') does not rename the account holder", async () => {
    const c = await mkAccount() // name 'Aziz'
    const { variant } = await mkVariant()
    const res = await order({ ...form, name: 'Mom', region: 'samarkand', lines: [{ variantId: variant.id, qty: 1 }] }, `${CUSTOMER_COOKIE}=${await sessionFor(c)}`)
    expect(res.status).toBe(201)
    expect((await prisma.order.findFirstOrThrow()).name).toBe('Mom')
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ name: 'Aziz', region: 'samarkand' })
  })

  it('signed in: body phone ignored (account phone used) and the address saved when asked', async () => {
    const c = await mkAccount()
    const { variant } = await mkVariant()
    const res = await order(
      { ...form, phone: '+998 90 765 43 21', lines: [{ variantId: variant.id, qty: 1 }], saveAddress: { label: 'Home' } },
      `${CUSTOMER_COOKIE}=${await sessionFor(c)}`,
    )
    expect(res.status).toBe(201)
    const o = await prisma.order.findFirstOrThrow()
    expect(o.phone).toBe(PHONE)
    expect(await prisma.customer.count({ where: { phone: '+998907654321' } })).toBe(0)
    expect(await prisma.customerAddress.findMany()).toEqual([
      expect.objectContaining({ customerId: c.id, label: 'Home', recipient: 'Aziz Karimov', address: 'Amir Temur 1', isDefault: true }),
    ])
  })

  it('invalid/revoked session -> guest behaviour (body phone used, nothing saved)', async () => {
    const c = await mkAccount()
    const token = await sessionFor(c)
    await prisma.customer.update({ where: { id: c.id }, data: { sessionVersion: { increment: 1 } } })
    const { variant } = await mkVariant()
    const res = await order({ ...form, phone: '+998 90 765 43 21', lines: [{ variantId: variant.id, qty: 1 }], saveAddress: { label: 'Home' } }, `${CUSTOMER_COOKIE}=${token}`)
    expect(res.status).toBe(201)
    expect((await prisma.order.findFirstOrThrow()).phone).toBe('+998907654321')
    expect(await prisma.customerAddress.count()).toBe(0)
  })
})

// ---------------------------------------------------------------- A11 across the boundary

describe('customer session never opens admin APIs', () => {
  it('customer token as customer_session or as admin_session -> 401 on /api/admin/orders', async () => {
    const c = await mkAccount()
    const token = await sessionFor(c)
    const get = (cookie: string) => adminOrdersGET(new NextRequest(`${ORIGIN}/api/admin/orders`, { headers: { cookie } }), {})
    expect((await get(`${CUSTOMER_COOKIE}=${token}`)).status).toBe(401)
    expect((await get(`${SESSION_COOKIE}=${token}`)).status).toBe(401)
  })
})

// ---------------------------------------------------------------- server actions

describe('account server actions', () => {
  it('signed out -> AUTH, nothing written', async () => {
    const { product } = await mkVariant()
    expect(await actions.toggleFavoriteAction(product.id)).toEqual({ ok: false, error: 'AUTH' })
    expect(await actions.saveAddressAction({ label: 'H', recipient: 'Aziz', region: 'tashkent-city', address: 'Street 1', isDefault: false })).toEqual({ ok: false, error: 'AUTH' })
    expect(await actions.updateProfileAction({ name: 'Aziz', locale: 'uz', notifyTelegram: true })).toEqual({ ok: false, error: 'AUTH' })
    expect(await actions.deleteAddressAction(1)).toEqual({ ok: false, error: 'AUTH' })
    expect(await actions.buyAgainAction(1001)).toEqual({ ok: false, error: 'AUTH' })
    expect(await actions.deleteAccountAction()).toEqual({ ok: false, error: 'AUTH' })
    expect(await prisma.favorite.count()).toBe(0)
  })

  it("signed in: own data only (IDOR on address / order -> NOT_FOUND)", async () => {
    const me = await mkAccount()
    const other = await mkAccount('+998907654321', 'tg2', '888')
    const theirs = await prisma.customerAddress.create({ data: { customerId: other.id, label: 'T', recipient: 'Other', region: 'tashkent-city', address: 'Their street', isDefault: true } })
    const { product, variant } = await mkVariant()
    await prisma.order.create({ data: { number: 1001, name: 'O', phone: other.phone, region: 'tashkent-city', address: 'x', locale: 'uz', totalUzs: 1, lines: { create: [{ variantId: variant.id, sku: 'V1', productTitle: 'T', variantName: 'B', priceUzs: 1, qty: 1 }] } } })
    jar.set(CUSTOMER_COOKIE, await sessionFor(me))

    expect(await actions.deleteAddressAction(theirs.id)).toEqual({ ok: false, error: 'NOT_FOUND' })
    expect(await actions.saveAddressAction({ id: theirs.id, label: 'X', recipient: 'Hacker', region: 'tashkent-city', address: 'Mine now', isDefault: true })).toEqual({ ok: false, error: 'NOT_FOUND' })
    expect(await actions.buyAgainAction(1001)).toEqual({ ok: false, error: 'NOT_FOUND' })
    expect(await prisma.customerAddress.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ recipient: 'Other' })

    expect(await actions.toggleFavoriteAction(product.id)).toEqual({ ok: true, favorite: true })
    expect(await actions.saveAddressAction({ label: 'H', recipient: 'Aziz', region: 'tashkent-city', address: 'Street 1', isDefault: false })).toMatchObject({ ok: true })
    expect(await actions.updateProfileAction({ name: 'Aziz K', locale: 'en', notifyTelegram: false })).toEqual({ ok: true })
  })

  it('deleteAccountAction deletes the account and clears the cookie', async () => {
    const me = await mkAccount()
    jar.set(CUSTOMER_COOKIE, await sessionFor(me))
    expect(await actions.deleteAccountAction()).toEqual({ ok: true })
    expect(jar.has(CUSTOMER_COOKIE)).toBe(false)
    // no orders -> the Customer row itself is removed (privacy)
    expect(await prisma.customer.findUnique({ where: { id: me.id } })).toBeNull()
  })
})
