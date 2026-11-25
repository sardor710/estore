import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { updateSettings } from '@/lib/settings'
import { CUSTOMER_COOKIE, createCustomerSession, customerFromToken } from '@/lib/account/session'
import { POST as sessionPOST } from '@/app/api/tg/session/route'
import { resetTgSessionLimits } from '@/lib/tg/limits'
import { tgSafeNext, tgLaunchUrl } from '@/lib/tg/next'
import { TG_MODE_COOKIE } from '@/lib/tg/mode'
import { signInitData, tgUser } from '../fixtures/tg'

const TOKEN = '123:abc'
const saved = { ...process.env }
beforeEach(async () => {
  process.env.SESSION_SECRET = 'k'.repeat(40)
  process.env.SITE_URL = 'http://localhost:3000'
  process.env.TRUST_PROXY = '1'
  resetTgSessionLimits()
  await updateSettings({ telegramBotToken: TOKEN })
})
afterEach(() => {
  process.env = { ...saved }
})

async function mkAccount(tg: string, o: { phone?: string; locale?: string | null; account?: boolean } = {}) {
  return prisma.customer.create({
    data: {
      phone: o.phone ?? `+9989${Math.floor(10000000 + Math.random() * 89999999)}`,
      name: 'Aziz',
      region: '',
      tags: [],
      telegramUserId: tg,
      telegramChatId: tg,
      accountLocale: o.locale === undefined ? 'ru' : o.locale,
      accountCreatedAt: o.account === false ? null : new Date(),
    },
  })
}

function call(body: unknown, o: { cookie?: string; ip?: string } = {}) {
  return sessionPOST(
    new NextRequest('http://localhost:3000/api/tg/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': o.ip ?? '5.5.5.5', ...(o.cookie ? { cookie: o.cookie } : {}) },
      body: JSON.stringify(body),
    }),
  )
}
const setCookies = (res: Response) => res.headers.getSetCookie()
const cookieValue = (res: Response, name: string) => setCookies(res).find((c) => c.startsWith(`${name}=`))

describe('POST /api/tg/session', () => {
  it('linked Telegram user -> signed in, session + tg_mode cookies, account locale', async () => {
    const c = await mkAccount('9001')
    const res = await call({ initData: signInitData(tgUser(9001, { languageCode: 'en' }), TOKEN) })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ signedIn: true, locale: 'ru', next: '/ru' })
    const session = cookieValue(res, CUSTOMER_COOKIE)!
    const token = decodeURIComponent(session.split(';')[0].split('=')[1])
    expect((await customerFromToken(token))?.id).toBe(c.id)
    expect(cookieValue(res, TG_MODE_COOKIE)).toMatch(/^tg_mode=1/)
    // a Mini App launch signs in silently on every open: it is not a "sign-in" for the dashboard
    expect((await prisma.customer.findUnique({ where: { id: c.id } }))?.lastLoginAt).toBeNull()
  })

  it('http SITE_URL -> SameSite=Lax; https SITE_URL -> SameSite=None; Secure; Partitioned', async () => {
    await mkAccount('9002')
    const lax = await call({ initData: signInitData(tgUser(9002), TOKEN) })
    expect(cookieValue(lax, CUSTOMER_COOKIE)).toMatch(/SameSite=lax/i)
    expect(cookieValue(lax, CUSTOMER_COOKIE)).not.toMatch(/Secure/i)
    process.env.SITE_URL = 'https://shop.test'
    const none = await call({ initData: signInitData(tgUser(9002), TOKEN) })
    for (const name of [CUSTOMER_COOKIE, TG_MODE_COOKIE]) {
      const v = cookieValue(none, name)!
      expect(v).toMatch(/SameSite=none/i)
      expect(v).toMatch(/Secure/i)
      expect(v).toMatch(/Partitioned/i)
      expect(v).toMatch(/HttpOnly/i)
    }
  })

  it('unlinked Telegram user -> guest with tg_mode, and an existing session of someone else is cleared', async () => {
    const other = await mkAccount('9100')
    const otherToken = await createCustomerSession({ cid: other.id, sv: 0 })
    const res = await call({ initData: signInitData(tgUser(9003, { languageCode: 'en' }), TOKEN) }, { cookie: `${CUSTOMER_COOKIE}=${otherToken}` })
    expect(await res.json()).toEqual({ signedIn: false, locale: 'en', next: '/en' })
    expect(cookieValue(res, CUSTOMER_COOKIE)).toMatch(/Max-Age=0/)
    expect(cookieValue(res, TG_MODE_COOKIE)).toMatch(/^tg_mode=1/)
  })

  it('switching Telegram accounts on one device replaces the session', async () => {
    const a = await mkAccount('9201')
    const b = await mkAccount('9202')
    const bToken = await createCustomerSession({ cid: b.id, sv: 0 })
    const res = await call({ initData: signInitData(tgUser(9201), TOKEN) }, { cookie: `${CUSTOMER_COOKIE}=${bToken}` })
    const token = decodeURIComponent(cookieValue(res, CUSTOMER_COOKIE)!.split(';')[0].split('=')[1])
    expect((await customerFromToken(token))?.id).toBe(a.id)
  })

  it('customer row without an account (accountCreatedAt null) is a guest', async () => {
    await mkAccount('9301', { account: false })
    const res = await call({ initData: signInitData(tgUser(9301), TOKEN) })
    expect((await res.json()).signedIn).toBe(false)
  })

  it('bad or missing initData -> 401 BAD_INIT_DATA, no cookies', async () => {
    for (const body of [{ initData: signInitData(tgUser(9001), 'other:token') }, { initData: '' }, {}, 'nope']) {
      const res = await call(body)
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'BAD_INIT_DATA' })
      expect(setCookies(res)).toEqual([])
    }
  })

  it('keeps a safe next path and drops an unsafe one', async () => {
    await mkAccount('9401', { locale: 'uz' })
    const ok = await call({ initData: signInitData(tgUser(9401), TOKEN), next: '/ru/account/orders/1001' })
    expect((await ok.json()).next).toBe('/ru/account/orders/1001')
    const bad = await call({ initData: signInitData(tgUser(9401), TOKEN), next: '//evil.com' })
    expect((await bad.json()).next).toBe('/uz')
  })

  it('locale falls back to Telegram language, then uz', async () => {
    const res = await call({ initData: signInitData(tgUser(9501, { languageCode: 'de' }), TOKEN) })
    expect((await res.json()).locale).toBe('uz')
    await mkAccount('9502', { locale: null })
    const r2 = await call({ initData: signInitData(tgUser(9502, { languageCode: 'ru' }), TOKEN) })
    expect((await r2.json()).locale).toBe('ru')
  })

  it('rate limits per IP (30/min)', async () => {
    const body = { initData: signInitData(tgUser(9601), TOKEN) }
    for (let i = 0; i < 30; i++) expect((await call(body, { ip: '7.7.7.7' })).status).toBe(200)
    expect((await call(body, { ip: '7.7.7.7' })).status).toBe(429)
    expect((await call(body, { ip: '7.7.7.8' })).status).toBe(200)
  })
})

describe('tgSafeNext / tgLaunchUrl', () => {
  it.each(['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)', '/ru//x', '/de/x', '/ru/\u0000x', ''])('rejects %j', (n) => {
    expect(tgSafeNext(n, 'uz')).toBe('/uz')
  })
  it.each(['/ru', '/en/p/anker-737', '/uz/account/addresses?lat=41.3&lng=69.2'])('accepts %s', (n) => {
    expect(tgSafeNext(n, 'uz')).toBe(n)
  })
  it('builds the launch URL only for an absolute site URL', () => {
    expect(tgLaunchUrl('/ru/account/orders/1001', 'https://shop.test/')).toBe('https://shop.test/tg?next=%2Fru%2Faccount%2Forders%2F1001')
    expect(tgLaunchUrl('/ru', '')).toBeNull()
    expect(tgLaunchUrl('/ru', 'not a url')).toBeNull()
  })
})

describe('POST /api/tg/session hardening (appsec review)', () => {
  const raw = (body: string, headers: Record<string, string>) =>
    sessionPOST(new NextRequest('http://localhost:3000/api/tg/session', { method: 'POST', headers: { 'x-forwarded-for': '6.6.6.6', ...headers }, body }))

  it('cross-site Origin -> 403 (login CSRF), no cookies', async () => {
    await mkAccount('9701')
    const res = await raw(JSON.stringify({ initData: signInitData(tgUser(9701), TOKEN) }), { 'content-type': 'application/json', origin: 'https://evil.example' })
    expect(res.status).toBe(403)
    expect(setCookies(res)).toEqual([])
  })
  it('non-JSON content type (form/text POST) -> 415', async () => {
    const res = await raw(JSON.stringify({ initData: signInitData(tgUser(9702), TOKEN) }), { 'content-type': 'text/plain' })
    expect(res.status).toBe(415)
  })
  it('initData older than 1 hour is refused (short bearer window)', async () => {
    const old = Math.floor(Date.now() / 1000) - 3601
    const res = await call({ initData: signInitData(tgUser(9703, { authDate: old }), TOKEN) })
    expect(res.status).toBe(401)
  })
  it('without TRUST_PROXY all clients share a large bucket, not 30/min for the whole shop', async () => {
    delete process.env.TRUST_PROXY
    const body = { initData: signInitData(tgUser(9704), TOKEN) }
    for (let i = 0; i < 40; i++) expect((await call(body)).status).toBe(200)
  })
})

describe('sign-out inside the Mini App (appsec review)', () => {
  it('logout with tg_mode clears the partitioned SameSite=None session cookie', async () => {
    const { POST: logoutPOST } = await import('@/app/api/account/logout/route')
    process.env.SITE_URL = 'https://shop.test'
    const res = await logoutPOST(
      new NextRequest('https://shop.test/api/account/logout', {
        method: 'POST',
        headers: { origin: 'https://shop.test', host: 'shop.test', cookie: `${TG_MODE_COOKIE}=1; ${CUSTOMER_COOKIE}=x`, 'content-length': '0' },
      }),
    )
    const c = cookieValue(res, CUSTOMER_COOKIE)!
    expect(c).toMatch(/Max-Age=0/)
    expect(c).toMatch(/SameSite=none/i)
    expect(c).toMatch(/Partitioned/i)
  })
  it('logout on the website keeps the Lax clear', async () => {
    const { POST: logoutPOST } = await import('@/app/api/account/logout/route')
    const res = await logoutPOST(
      new NextRequest('http://localhost:3000/api/account/logout', { method: 'POST', headers: { cookie: `${CUSTOMER_COOKIE}=x`, 'content-length': '0' } }),
    )
    expect(cookieValue(res, CUSTOMER_COOKIE)).toMatch(/SameSite=lax/i)
  })
})

describe('POST /api/tg/exit (Telegram mode without a Telegram client: fall back to the website UI)', () => {
  it('clears tg_mode (same-origin only)', async () => {
    const { POST: exitPOST } = await import('@/app/api/tg/exit/route')
    const ok = await exitPOST(new NextRequest('http://localhost:3000/api/tg/exit', { method: 'POST', headers: { cookie: `${TG_MODE_COOKIE}=1` } }))
    expect(ok.status).toBe(200)
    expect(cookieValue(ok, TG_MODE_COOKIE)).toMatch(/Max-Age=0/)
    const evil = await exitPOST(
      new NextRequest('http://localhost:3000/api/tg/exit', { method: 'POST', headers: { origin: 'https://evil.example', cookie: `${TG_MODE_COOKIE}=1` } }),
    )
    expect(evil.status).toBe(403)
    expect(setCookies(evil)).toEqual([])
  })
})
