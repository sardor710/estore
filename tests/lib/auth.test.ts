import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SignJWT } from 'jose'
import { bootstrapCredentials, createSession, isSessionConfigured, readSession } from '@/lib/auth'
import { attemptLogin, resetThrottle } from '@/lib/admin/login'
import { prisma } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/password'

vi.mock('@/lib/password', async (orig) => {
  const m = await orig<typeof import('@/lib/password')>()
  return { ...m, verifyPassword: vi.fn(m.verifyPassword) }
})

const SECRET = 'x'.repeat(40)
const saved = { ...process.env }
const claims = { uid: 1, role: 'ADMIN' as const, sv: 0 }

beforeEach(() => {
  process.env.ADMIN_USER = 'owner'
  process.env.ADMIN_PASSWORD = 'correct horse'
  process.env.SESSION_SECRET = SECRET
  resetThrottle()
})
afterEach(() => {
  process.env = { ...saved }
})

describe('configuration', () => {
  it('only SESSION_SECRET is required for sessions', async () => {
    delete process.env.ADMIN_USER
    delete process.env.ADMIN_PASSWORD
    expect(isSessionConfigured()).toBe(true)
    expect(await readSession(await createSession(claims))).toEqual(claims)
  })
  it('bootstrapCredentials needs ADMIN_USER and a non-placeholder ADMIN_PASSWORD >= 10 chars', () => {
    expect(bootstrapCredentials()).toEqual({ user: 'owner', password: 'correct horse' })
    for (const pw of ['change-me', 'CHANGE-ME', 'changeme', 'password', 'short9chr', '']) {
      process.env.ADMIN_PASSWORD = pw
      expect(bootstrapCredentials(), pw).toBeNull()
    }
    process.env.ADMIN_PASSWORD = 'correct horse'
    process.env.ADMIN_USER = '  '
    expect(bootstrapCredentials()).toBeNull()
  })
  it('placeholder or short SESSION_SECRET fails closed', async () => {
    for (const secret of ['change-me-to-a-long-random-string', 'replace-with-a-long-random-string-of-48-chars', 'short']) {
      process.env.SESSION_SECRET = secret
      expect(isSessionConfigured(), secret).toBe(false)
      await expect(createSession(claims)).rejects.toThrow()
    }
  })
  it('.env.example itself configures neither sessions nor bootstrap', async () => {
    const { readFileSync } = await import('node:fs')
    const { parse } = await import('dotenv')
    const ex = parse(readFileSync('.env.example', 'utf8'))
    process.env.ADMIN_USER = ex.ADMIN_USER
    process.env.ADMIN_PASSWORD = ex.ADMIN_PASSWORD
    process.env.SESSION_SECRET = ex.SESSION_SECRET
    expect(isSessionConfigured()).toBe(false)
    expect(bootstrapCredentials()).toBeNull()
  })
})

describe('session token', () => {
  it('round-trips the claims', async () => {
    expect(await readSession(await createSession({ uid: 1, role: 'ADMIN', sv: 0 }))).toEqual({ uid: 1, role: 'ADMIN', sv: 0 })
    expect(await readSession(await createSession({ uid: 7, role: 'BLOG_EDITOR', sv: 3 }))).toEqual({ uid: 7, role: 'BLOG_EDITOR', sv: 3 })
  })
  it('rejects tampered, garbage, empty', async () => {
    const t = await createSession(claims)
    const [h, , s] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ sub: '2', uid: 2, role: 'ADMIN', sv: 0, exp: 9999999999 })).toString('base64url')
    expect(await readSession(`${h}.${forged}.${s}`)).toBeNull()
    expect(await readSession(`${t}x`)).toBeNull()
    expect(await readSession('garbage')).toBeNull()
    expect(await readSession('')).toBeNull()
    expect(await readSession(undefined)).toBeNull()
    expect(await readSession(null)).toBeNull()
  })
  it('rejects expired tokens, other secrets and malformed claims', async () => {
    const key = new TextEncoder().encode(SECRET)
    const sign = (payload: Record<string, unknown>, exp: number | string = '1h', k = key) =>
      new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setSubject(String(payload.uid ?? '')).setIssuer('estore-admin').setAudience('estore-admin').setExpirationTime(exp).sign(k)
    expect(await readSession(await sign({ uid: 1, role: 'ADMIN', sv: 0 }, Math.floor(Date.now() / 1000) - 10))).toBeNull()
    expect(await readSession(await sign({ uid: 1, role: 'ADMIN', sv: 0 }, '1h', new TextEncoder().encode('y'.repeat(40))))).toBeNull()
    expect(await readSession(await sign({ uid: 1, role: 'ROOT', sv: 0 }))).toBeNull()
    expect(await readSession(await sign({ uid: 'abc', role: 'ADMIN', sv: 0 }))).toBeNull()
    expect(await readSession(await sign({ uid: 1, role: 'ADMIN', sv: -1 }))).toBeNull()
    // Sanity: the same helper with valid claims is accepted.
    expect(await readSession(await sign({ uid: 1, role: 'ADMIN', sv: 0 }))).toEqual(claims)
  })
  it('rejects old single-owner tokens (no claims)', async () => {
    const key = new TextEncoder().encode(SECRET)
    const legacy = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('owner').setExpirationTime('1h').sign(key)
    expect(await readSession(legacy)).toBeNull()
  })
  it('rejects alg none', async () => {
    const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    expect(await readSession(`${b({ alg: 'none' })}.${b({ sub: '1', uid: 1, role: 'ADMIN', sv: 0, exp: 9999999999 })}.`)).toBeNull()
  })
  it('fails closed when SESSION_SECRET is removed', async () => {
    const t = await createSession(claims)
    delete process.env.SESSION_SECRET
    expect(await readSession(t)).toBeNull()
  })
})

async function seedUser(email: string, password: string, extra: { role?: string; active?: boolean } = {}) {
  return prisma.adminUser.create({
    data: { email, name: email, role: extra.role ?? 'ADMIN', active: extra.active ?? true, passwordHash: await hashPassword(password) },
  })
}

describe('attemptLogin: bootstrap from .env', () => {
  it('on an empty table the .env credentials create the first full admin and log in', async () => {
    const r = await attemptLogin({ email: 'Owner', password: 'correct horse', ip: '1.1.1.1' })
    expect(r.status).toBe(200)
    const u = await prisma.adminUser.findUniqueOrThrow({ where: { email: 'owner' } })
    expect(u.role).toBe('ADMIN')
    expect(u.lastLoginAt).not.toBeNull()
    expect(await readSession((r as { token: string }).token)).toEqual({ uid: u.id, role: 'ADMIN', sv: 0 })
    expect(await prisma.activityLog.count({ where: { action: 'login', userId: u.id } })).toBe(1)
  })
  it('wrong .env password on an empty table creates nobody', async () => {
    expect((await attemptLogin({ email: 'owner', password: 'wrong password', ip: '1.1.1.1' })).status).toBe(401)
    expect(await prisma.adminUser.count()).toBe(0)
  })
  it('.env credentials stop working once users exist', async () => {
    await seedUser('boss@shop.uz', 'boss password 1')
    expect((await attemptLogin({ email: 'owner', password: 'correct horse', ip: '1.1.1.1' })).status).toBe(401)
    expect(await prisma.adminUser.count()).toBe(1)
  })
  it('503 without SESSION_SECRET, or with no users and no usable bootstrap credentials', async () => {
    delete process.env.SESSION_SECRET
    expect(await attemptLogin({ email: 'owner', password: 'correct horse', ip: 'a' })).toEqual({ status: 503 })
    process.env.SESSION_SECRET = SECRET
    process.env.ADMIN_PASSWORD = 'change-me'
    expect(await attemptLogin({ email: 'owner', password: 'change-me', ip: 'a' })).toEqual({ status: 503 })
  })
})

describe('attemptLogin: staff accounts', () => {
  it('right email + password -> token with uid/role/sv; email is case-insensitive', async () => {
    const u = await seedUser('pm@shop.uz', 'pm password 12', { role: 'PRODUCT_MANAGER' })
    const r = await attemptLogin({ email: ' PM@shop.uz ', password: 'pm password 12', ip: '1.1.1.1' })
    expect(r).toMatchObject({ status: 200, role: 'PRODUCT_MANAGER' })
    expect(await readSession((r as { token: string }).token)).toEqual({ uid: u.id, role: 'PRODUCT_MANAGER', sv: 0 })
  })
  it('wrong password, unknown email and disabled user all give the same 401', async () => {
    await seedUser('a@shop.uz', 'a password 123')
    await seedUser('off@shop.uz', 'off password 1', { active: false })
    expect(await attemptLogin({ email: 'a@shop.uz', password: 'bad', ip: '1' })).toEqual({ status: 401 })
    expect(await attemptLogin({ email: 'nobody@shop.uz', password: 'a password 123', ip: '1' })).toEqual({ status: 401 })
    expect(await attemptLogin({ email: 'off@shop.uz', password: 'off password 1', ip: '1' })).toEqual({ status: 401 })
    expect(await prisma.activityLog.count()).toBe(0)
  })
  it('unknown email still runs a password hash (no timing shortcut for user enumeration)', async () => {
    await seedUser('a@shop.uz', 'a password 123')
    vi.mocked(verifyPassword).mockClear()
    await attemptLogin({ email: 'nobody@shop.uz', password: 'whatever pw', ip: '1' })
    expect(verifyPassword).toHaveBeenCalledTimes(1)
  })
})

describe('attemptLogin throttle', () => {
  beforeEach(async () => {
    await seedUser('owner@shop.uz', 'correct horse')
  })
  const login = (password: string, ip: string, now?: number) => attemptLogin({ email: 'owner@shop.uz', password, ip, now })

  it('throttles after 5 failures per ip, even for the right password; other ips unaffected', async () => {
    for (let i = 0; i < 5; i++) expect((await login('bad', '2.2.2.2')).status).toBe(401)
    expect((await login('correct horse', '2.2.2.2')).status).toBe(429)
    expect((await login('correct horse', '3.3.3.3')).status).toBe(200)
  })
  it('window expires', async () => {
    const t0 = 1_000_000
    for (let i = 0; i < 5; i++) await login('bad', '4.4.4.4', t0)
    expect((await login('correct horse', '4.4.4.4', t0 + 1000)).status).toBe(429)
    expect((await login('correct horse', '4.4.4.4', t0 + 61_000)).status).toBe(200)
  })
  it('rotating X-Forwarded-For without TRUST_PROXY still hits 429 after 5 (route key is constant)', async () => {
    delete process.env.TRUST_PROXY
    const { POST } = await import('@/app/api/admin/login/route')
    const { NextRequest } = await import('next/server')
    const hit = (xff: string, password: string) =>
      POST(new NextRequest('http://localhost:3000/api/admin/login', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', host: 'localhost:3000', 'x-forwarded-for': xff, 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@shop.uz', password }),
      }))
    for (let i = 0; i < 5; i++) expect((await hit(`9.9.9.${i}`, 'bad')).status).toBe(401)
    expect((await hit('9.9.9.99', 'bad')).status).toBe(429)
    expect((await hit('9.9.9.100', 'correct horse')).status).toBe(429)
  })
  it('login route sets an HttpOnly session cookie and returns the role home', async () => {
    const { POST } = await import('@/app/api/admin/login/route')
    const { NextRequest } = await import('next/server')
    const res = await POST(new NextRequest('http://localhost:3000/api/admin/login', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', host: 'localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@shop.uz', password: 'correct horse' }),
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, home: '/admin' })
    expect(res.headers.get('set-cookie')).toMatch(/admin_session=.+HttpOnly/i)
  })
  it('10 concurrent wrong attempts: at most 5 are evaluated, the rest get 429', async () => {
    const rs = await Promise.all(Array.from({ length: 10 }, () => login('bad', 'c')))
    expect(rs.filter((r) => r.status === 401).length).toBe(5)
    expect(rs.filter((r) => r.status === 429).length).toBe(5)
  })
  it('a successful login does not consume the budget', async () => {
    for (let i = 0; i < 8; i++) expect((await login('correct horse', 's')).status).toBe(200)
  })
  it('global bucket: 20 failures across many ips blocks everyone', async () => {
    for (let i = 0; i < 20; i++) await login('bad', `g${i}`)
    expect((await login('correct horse', 'fresh')).status).toBe(429)
  })
  it('caps tracked ips', async () => {
    const { trackedIps } = await import('@/lib/admin/login')
    // Hashing is irrelevant here (and 10k scrypt runs would be slow): only the limiter bookkeeping is tested.
    vi.mocked(verifyPassword).mockResolvedValue(false)
    try {
      for (let i = 0; i < 10_050; i++) await login('bad', `m${i}`, 1000 + i * 100_000)
    } finally {
      vi.mocked(verifyPassword).mockReset()
      const real = await vi.importActual<typeof import('@/lib/password')>('@/lib/password')
      vi.mocked(verifyPassword).mockImplementation(real.verifyPassword)
    }
    expect(trackedIps()).toBeLessThanOrEqual(10_000)
  }, 60_000)
})

describe('attemptLogin: password length cap', () => {
  it('a password over 200 chars is a normal 401 and never reaches scrypt', async () => {
    await seedUser('cap@shop.uz', 'cap password 12')
    vi.mocked(verifyPassword).mockClear()
    expect(await attemptLogin({ email: 'cap@shop.uz', password: 'x'.repeat(201), ip: '9.9.9.9' })).toEqual({ status: 401 })
    expect(verifyPassword).not.toHaveBeenCalled()
    expect((await attemptLogin({ email: 'cap@shop.uz', password: 'cap password 12', ip: '9.9.9.9' })).status).toBe(200)
  })
})
