import { SignJWT, jwtVerify } from 'jose'
import { isRole, type Role } from './permissions'

// Edge-safe: only jose + Web Crypto, because the proxy (middleware) imports this module.

export const SESSION_COOKIE = 'admin_session'
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60

/** Options for every place that sets the session cookie (login route, cookie re-issue after a password change). */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_MAX_AGE,
} as const

export const MIN_PASSWORD_LENGTH = 10
export const MIN_SECRET_LENGTH = 32

const ISSUER = 'estore-admin'
const AUDIENCE = 'estore-admin'

/** Identifiers only: the role is a hint, the DB row (active, role, sessionVersion) is re-read on every request. */
export type SessionClaims = { uid: number; role: Role; sv: number }

/** Example / well-known values (including old .env.example ones) that must never unlock the admin. */
const PLACEHOLDERS = new Set([
  'change-me', 'changeme', 'change-me-to-a-long-random-string', 'replace-me', 'replace-with-a-long-random-string-of-48-chars',
  'password', 'password123', 'admin', 'admin123', 'secret', 'your-secret', 'your-password', '1234567890', 'qwerty12345',
])
const isPlaceholder = (v: string) => PLACEHOLDERS.has(v.trim().toLowerCase())

/** Null (sessions fail closed) unless SESSION_SECRET has >= 32 chars and is not a known placeholder. */
function secretKey(): Uint8Array | null {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < MIN_SECRET_LENGTH || isPlaceholder(secret)) return null
  return new TextEncoder().encode(secret)
}

export function isSessionConfigured(): boolean {
  return secretKey() !== null
}

/**
 * The .env owner login (ADMIN_USER / ADMIN_PASSWORD >= 10 chars, no placeholder). Only used to create the first
 * full admin while the AdminUser table is empty; ignored afterwards.
 */
export function bootstrapCredentials(): { user: string; password: string } | null {
  const user = process.env.ADMIN_USER?.trim()
  const password = process.env.ADMIN_PASSWORD
  if (!user || !password || password.length < MIN_PASSWORD_LENGTH || isPlaceholder(password)) return null
  return { user, password }
}

export async function createSession(c: SessionClaims): Promise<string> {
  const key = secretKey()
  if (!key) throw new Error('Sessions are not configured (SESSION_SECRET >= 32 random chars, no example value)')
  return new SignJWT({ uid: c.uid, role: c.role, sv: c.sv })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(c.uid))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(key)
}

export async function readSession(token?: string | null): Promise<SessionClaims | null> {
  const key = secretKey()
  if (!key || !token) return null
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE })
    const { uid, role, sv, sub } = payload as Record<string, unknown>
    if (!Number.isSafeInteger(uid) || (uid as number) <= 0 || sub !== String(uid)) return null
    if (!isRole(role) || !Number.isSafeInteger(sv) || (sv as number) < 0) return null
    return { uid: uid as number, role, sv: sv as number }
  } catch {
    return null
  }
}

async function digest(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
}

/** Constant-time compare of two strings via their equal-length SHA-256 digests. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([digest(a ?? ''), digest(b ?? '')])
  let diff = 0
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i]
  return diff === 0
}
