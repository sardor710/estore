import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SignJWT } from 'jose'
import { createSession, verifySession, checkCredentials, isAdminConfigured } from '@/lib/auth'
import { attemptLogin, resetThrottle } from '@/lib/admin/login'

const SECRET = 'x'.repeat(40)
const saved = { ...process.env }

beforeEach(() => {
  process.env.ADMIN_USER = 'owner'
  process.env.ADMIN_PASSWORD = 'correct horse'
  process.env.SESSION_SECRET = SECRET
  resetThrottle()
})
afterEach(() => {
  process.env = { ...saved }
})

describe('checkCredentials', () => {
  it('accepts the right pair', async () => {
    expect(await checkCredentials('owner', 'correct horse')).toBe(true)
  })
  it('rejects wrong password, wrong user, empty input', async () => {
    expect(await checkCredentials('owner', 'nope')).toBe(false)
    expect(await checkCredentials('someone', 'correct horse')).toBe(false)
    expect(await checkCredentials('', '')).toBe(false)
    expect(await checkCredentials('owner', 'correct horse extra')).toBe(false)
  })
  it('fails closed when env is missing', async () => {
    delete process.env.ADMIN_PASSWORD
    expect(isAdminConfigured()).toBe(false)
    expect(await checkCredentials('owner', 'correct horse')).toBe(false)
    expect(await checkCredentials('owner', '')).toBe(false)
  })
  it('fails closed on .env.example placeholders and short passwords', async () => {
    for (const pw of ['change-me', 'CHANGE-ME', 'changeme', 'password', 'short9chr']) {
      process.env.ADMIN_PASSWORD = pw
      expect(isAdminConfigured(), pw).toBe(false)
      expect(await checkCredentials('owner', pw)).toBe(false)
    }
    process.env.ADMIN_PASSWORD = 'correct horse'
    for (const secret of ['change-me-to-a-long-random-string', 'replace-with-a-long-random-string-of-48-chars']) {
      process.env.SESSION_SECRET = secret
      expect(isAdminConfigured(), secret).toBe(false)
      await expect(createSession('owner')).rejects.toThrow()
    }
    process.env.SESSION_SECRET = SECRET
    expect(isAdminConfigured()).toBe(true)
  })
  it('.env.example itself does not configure the admin', async () => {
    const { readFileSync } = await import('node:fs')
    const { parse } = await import('dotenv')
    const ex = parse(readFileSync('.env.example', 'utf8'))
    process.env.ADMIN_USER = ex.ADMIN_USER
    process.env.ADMIN_PASSWORD = ex.ADMIN_PASSWORD
    process.env.SESSION_SECRET = ex.SESSION_SECRET
    expect(isAdminConfigured()).toBe(false)
  })
})

describe('session token', () => {
  it('round-trips', async () => {
    expect(await verifySession(await createSession('owner'))).toBe(true)
  })
  it('rejects tampered, garbage, empty', async () => {
    const t = await createSession('owner')
    const [h, , s] = t.split('.')
    const forged = Buffer.from('{"sub":"owner","exp":9999999999}').toString('base64url')
    expect(await verifySession(`${h}.${forged}.${s}`)).toBe(false)
    expect(await verifySession(`${t}x`)).toBe(false)
    expect(await verifySession('garbage')).toBe(false)
    expect(await verifySession('')).toBe(false)
    expect(await verifySession(undefined)).toBe(false)
  })
  it('rejects expired token and token signed with another secret', async () => {
    const key = new TextEncoder().encode(SECRET)
    const expired = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('owner').setExpirationTime(Math.floor(Date.now() / 1000) - 10).sign(key)
    expect(await verifySession(expired)).toBe(false)
    const other = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('owner').setExpirationTime('1h').sign(new TextEncoder().encode('y'.repeat(40)))
    expect(await verifySession(other)).toBe(false)
  })
  it('rejects alg none', async () => {
    const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    expect(await verifySession(`${b({ alg: 'none' })}.${b({ sub: 'owner', exp: 9999999999 })}.`)).toBe(false)
  })
  it('fails closed without or with a short SESSION_SECRET', async () => {
    const t = await createSession('owner')
    delete process.env.SESSION_SECRET
    expect(await verifySession(t)).toBe(false)
    await expect(createSession('owner')).rejects.toThrow()
    process.env.SESSION_SECRET = 'short'
    expect(await verifySession(t)).toBe(false)
    await expect(createSession('owner')).rejects.toThrow()
  })
  it('token is invalid after the admin user changes', async () => {
    const t = await createSession('owner')
    process.env.ADMIN_USER = 'other'
    expect(await verifySession(t)).toBe(false)
  })
})

describe('attemptLogin', () => {
  it('wrong password gives 401 and no token', async () => {
    expect(await attemptLogin({ user: 'owner', password: 'bad', ip: '1.1.1.1' })).toEqual({ status: 401 })
  })
  it('right password gives a valid token', async () => {
    const r = await attemptLogin({ user: 'owner', password: 'correct horse', ip: '1.1.1.1' })
    expect(r.status).toBe(200)
    expect(await verifySession((r as { token: string }).token)).toBe(true)
  })
  it('503 when not configured', async () => {
    delete process.env.SESSION_SECRET
    expect(await attemptLogin({ user: 'owner', password: 'correct horse', ip: 'a' })).toEqual({ status: 503 })
  })
  it('throttles after 5 failures per ip, even for the right password; other ips unaffected', async () => {
    for (let i = 0; i < 5; i++) expect((await attemptLogin({ user: 'owner', password: 'bad', ip: '2.2.2.2' })).status).toBe(401)
    expect((await attemptLogin({ user: 'owner', password: 'correct horse', ip: '2.2.2.2' })).status).toBe(429)
    expect((await attemptLogin({ user: 'owner', password: 'correct horse', ip: '3.3.3.3' })).status).toBe(200)
  })
  it('window expires', async () => {
    const t0 = 1_000_000
    for (let i = 0; i < 5; i++) await attemptLogin({ user: 'owner', password: 'bad', ip: '4.4.4.4', now: t0 })
    expect((await attemptLogin({ user: 'owner', password: 'correct horse', ip: '4.4.4.4', now: t0 + 1000 })).status).toBe(429)
    expect((await attemptLogin({ user: 'owner', password: 'correct horse', ip: '4.4.4.4', now: t0 + 61_000 })).status).toBe(200)
  })
})

describe('attemptLogin hardening', () => {
  it('rotating X-Forwarded-For without TRUST_PROXY still hits 429 after 5 (route key is constant)', async () => {
    delete process.env.TRUST_PROXY
    const { POST } = await import('@/app/api/admin/login/route')
    const { NextRequest } = await import('next/server')
    const hit = (xff: string, password: string) =>
      POST(new NextRequest('http://localhost:3000/api/admin/login', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', host: 'localhost:3000', 'x-forwarded-for': xff, 'content-type': 'application/json' },
        body: JSON.stringify({ user: 'owner', password }),
      }))
    for (let i = 0; i < 5; i++) expect((await hit(`9.9.9.${i}`, 'bad')).status).toBe(401)
    expect((await hit('9.9.9.99', 'bad')).status).toBe(429)
    expect((await hit('9.9.9.100', 'correct horse')).status).toBe(429)
  })
  it('10 concurrent wrong attempts: at most 5 are evaluated, the rest get 429', async () => {
    const rs = await Promise.all(Array.from({ length: 10 }, () => attemptLogin({ user: 'owner', password: 'bad', ip: 'c' })))
    expect(rs.filter((r) => r.status === 401).length).toBe(5)
    expect(rs.filter((r) => r.status === 429).length).toBe(5)
  })
  it('a successful login does not consume the budget', async () => {
    for (let i = 0; i < 8; i++) expect((await attemptLogin({ user: 'owner', password: 'correct horse', ip: 's' })).status).toBe(200)
  })
  it('global bucket: 20 failures across many ips blocks everyone', async () => {
    for (let i = 0; i < 20; i++) await attemptLogin({ user: 'owner', password: 'bad', ip: `g${i}` })
    expect((await attemptLogin({ user: 'owner', password: 'correct horse', ip: 'fresh' })).status).toBe(429)
  })
  it('caps tracked ips', async () => {
    const { trackedIps } = await import('@/lib/admin/login')
    for (let i = 0; i < 10_050; i++) await attemptLogin({ user: 'owner', password: 'bad', ip: `m${i}`, now: 1000 + i * 100_000 })
    expect(trackedIps()).toBeLessThanOrEqual(10_000)
  })
})
