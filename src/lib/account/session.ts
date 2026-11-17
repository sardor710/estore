import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SignJWT, jwtVerify } from 'jose'
import { prisma } from '@/lib/db'
import { isSessionConfigured } from '@/lib/auth'
import { locales, type Locale } from '@/i18n/routing'
import { siteIsHttps, tgCookieOptions } from '@/lib/tg/mode'

// Customer (shopper) sessions. Same SESSION_SECRET as staff sessions, but a distinct issuer + audience and a
// distinct claims shape ({ cid, sv } vs { uid, role, sv }): a customer token never passes staff `readSession`
// (audience 'estore-admin') and a staff token never passes `readCustomerSession` (audience 'customer').

export const CUSTOMER_COOKIE = 'customer_session'
export const CUSTOMER_SESSION_MAX_AGE = 30 * 24 * 3600

export const CUSTOMER_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: CUSTOMER_SESSION_MAX_AGE,
} as const

const ISSUER = 'estore-customer'
const AUDIENCE = 'customer'

/** Identifiers only; the Customer row (accountCreatedAt, sessionVersion) is re-read on every request. */
export type CustomerSessionClaims = { cid: number; sv: number }

/** Reuses the staff secret policy (>= 32 chars, no placeholder): null -> sessions fail closed. */
function secretKey(): Uint8Array | null {
  if (!isSessionConfigured()) return null
  return new TextEncoder().encode(process.env.SESSION_SECRET!)
}

export async function createCustomerSession(c: CustomerSessionClaims): Promise<string> {
  const key = secretKey()
  if (!key) throw new Error('Sessions are not configured (SESSION_SECRET >= 32 random chars, no example value)')
  return new SignJWT({ cid: c.cid, sv: c.sv })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(c.cid))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${CUSTOMER_SESSION_MAX_AGE}s`)
    .sign(key)
}

export async function readCustomerSession(token?: string | null): Promise<CustomerSessionClaims | null> {
  const key = secretKey()
  if (!key || !token) return null
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE })
    const { cid, sv, sub, uid, role } = payload as Record<string, unknown>
    if (uid !== undefined || role !== undefined) return null // staff-shaped claims are never a customer session
    if (!Number.isSafeInteger(cid) || (cid as number) <= 0 || sub !== String(cid)) return null
    if (!Number.isSafeInteger(sv) || (sv as number) < 0) return null
    return { cid: cid as number, sv: sv as number }
  } catch {
    return null
  }
}

export type AccountCustomer = {
  id: number
  phone: string
  name: string
  locale: Locale | null
  notifyTelegram: boolean
  blocked: boolean
}

const toLocale = (v: string | null): Locale | null => ((locales as readonly string[]).includes(v ?? '') ? (v as Locale) : null)

/**
 * Token -> signed-in account. The DB row is the authority: no account (accountCreatedAt null, e.g. deleted) or a
 * bumped sessionVersion (sign out everywhere, relink to another Telegram user) -> null on the very next request.
 */
export async function customerFromToken(token: string | null | undefined): Promise<AccountCustomer | null> {
  const claims = await readCustomerSession(token)
  if (!claims) return null
  const c = await prisma.customer.findUnique({ where: { id: claims.cid } })
  if (!c || !c.accountCreatedAt || c.sessionVersion !== claims.sv) return null
  return { id: c.id, phone: c.phone, name: c.name, locale: toLocale(c.accountLocale), notifyTelegram: c.notifyTelegram, blocked: c.blocked }
}

/** Fresh session token for an account (current sessionVersion), or null when the customer has no account. */
export async function issueCustomerSession(customerId: number): Promise<string | null> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, sessionVersion: true, accountCreatedAt: true } })
  if (!c || !c.accountCreatedAt) return null
  return createCustomerSession({ cid: c.id, sv: c.sessionVersion })
}

/** Current account from the `customer_session` cookie (memoised per request render). */
export const getAccountCustomer = cache(async (): Promise<AccountCustomer | null> =>
  customerFromToken((await cookies()).get(CUSTOMER_COOKIE)?.value),
)

/**
 * Pages/actions that need a signed-in shopper. `next` must be a same-site path; it is URL-encoded here and must
 * still be validated by the login page before redirecting to it.
 */
export async function requireAccountCustomer(locale: Locale, next: string): Promise<AccountCustomer> {
  const c = await getAccountCustomer()
  if (!c) redirect(`/${locale}/login?next=${encodeURIComponent(next)}`)
  return c
}

/** Anything with a Next cookie-store `set` (route handler `NextResponse.cookies` or `await cookies()`). */
export type CookieSink = { set(name: string, value: string, options?: Record<string, unknown>): unknown }

/** Sets the session cookie. Without a target: the request cookie store (server actions / route handlers only). */
export async function setCustomerCookie(target: CookieSink | null | undefined, token: string): Promise<void> {
  const sink: CookieSink = target ?? (await cookies())
  sink.set(CUSTOMER_COOKIE, token, { ...CUSTOMER_COOKIE_OPTIONS })
}

/**
 * Expires the session cookie in the browser (server-side revocation is `sessionVersion`). Inside the Telegram Mini App
 * (`telegram: true`) the cookie was set SameSite=None; Partitioned, and only a clear with the same attributes removes it.
 */
export async function clearCustomerCookie(target?: CookieSink | null, opts: { telegram?: boolean } = {}): Promise<void> {
  const sink: CookieSink = target ?? (await cookies())
  const base = opts.telegram ? tgCookieOptions(siteIsHttps()) : CUSTOMER_COOKIE_OPTIONS
  sink.set(CUSTOMER_COOKIE, '', { ...base, maxAge: 0 })
}
