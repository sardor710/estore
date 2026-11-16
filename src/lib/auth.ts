import { SignJWT, jwtVerify } from 'jose'

// Edge-safe: only jose + Web Crypto, because middleware imports this module.

export const SESSION_COOKIE = 'admin_session'
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60

type AuthConfig = { user: string; password: string; secret: Uint8Array }

/** Null when ADMIN_USER / ADMIN_PASSWORD / SESSION_SECRET (>= 32 chars) are not all set: everything fails closed. */
function config(): AuthConfig | null {
  const user = process.env.ADMIN_USER
  const password = process.env.ADMIN_PASSWORD
  const secret = process.env.SESSION_SECRET
  if (!user || !password || !secret || secret.length < 32) return null
  return { user, password, secret: new TextEncoder().encode(secret) }
}

export function isAdminConfigured(): boolean {
  return config() !== null
}

export async function createSession(user: string): Promise<string> {
  const c = config()
  if (!c) throw new Error('Admin is not configured (ADMIN_USER, ADMIN_PASSWORD, SESSION_SECRET >= 32 chars)')
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
