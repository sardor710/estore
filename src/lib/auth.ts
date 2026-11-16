import { SignJWT, jwtVerify } from 'jose'

// Edge-safe: only jose + Web Crypto, because middleware imports this module.

export const SESSION_COOKIE = 'admin_session'
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60

type AuthConfig = { user: string; password: string; secret: Uint8Array }

export const MIN_PASSWORD_LENGTH = 10
export const MIN_SECRET_LENGTH = 32

/** Example / well-known values (including old .env.example ones) that must never unlock the admin. */
const PLACEHOLDERS = new Set([
  'change-me', 'changeme', 'change-me-to-a-long-random-string', 'replace-me', 'replace-with-a-long-random-string-of-48-chars',
  'password', 'password123', 'admin', 'admin123', 'secret', 'your-secret', 'your-password', '1234567890', 'qwerty12345',
])
const isPlaceholder = (v: string) => PLACEHOLDERS.has(v.trim().toLowerCase())

/**
 * Null (everything fails closed, "Admin not configured") unless ADMIN_USER, ADMIN_PASSWORD (>= 10 chars) and
 * SESSION_SECRET (>= 32 chars) are all set and neither is a known placeholder value.
 */
function config(): AuthConfig | null {
  const user = process.env.ADMIN_USER
  const password = process.env.ADMIN_PASSWORD
  const secret = process.env.SESSION_SECRET
  if (!user || !password || !secret) return null
  if (password.length < MIN_PASSWORD_LENGTH || secret.length < MIN_SECRET_LENGTH) return null
  if (isPlaceholder(password) || isPlaceholder(secret)) return null
  return { user, password, secret: new TextEncoder().encode(secret) }
}

export function isAdminConfigured(): boolean {
  return config() !== null
}

export async function createSession(user: string): Promise<string> {
  const c = config()
  if (!c) throw new Error('Admin is not configured (ADMIN_USER, ADMIN_PASSWORD >= 10 chars, SESSION_SECRET >= 32 random chars, no example values)')
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(c.secret)
}

export async function verifySession(token: string | null | undefined): Promise<boolean> {
  const c = config()
  if (!c || !token) return false
  try {
    const { payload } = await jwtVerify(token, c.secret, { algorithms: ['HS256'] })
    return payload.sub === c.user
  } catch {
    return false
  }
}

async function digest(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
}

/** Constant-time compare of two strings via their equal-length SHA-256 digests. */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([digest(a), digest(b)])
  let diff = 0
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i]
  return diff === 0
}

export async function checkCredentials(user: string, password: string): Promise<boolean> {
  const c = config()
  if (!c) return false
  // Evaluate both so timing does not reveal which one was wrong.
  const [u, p] = await Promise.all([safeEqual(user ?? '', c.user), safeEqual(password ?? '', c.password)])
  return u && p
}
