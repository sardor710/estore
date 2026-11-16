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
