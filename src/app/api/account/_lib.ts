import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createLimiter, createSharedAwareLimiter } from '@/lib/rate-limit'
import { markSignedIn } from '@/lib/account/activity'

// Shared bits of the customer account API (not a route: only `route.ts` files are routed).

const MIN = 60_000

/**
 * Per-IP limits (M1 threat model): start 20/10 min, verify 20/15 min. Without TRUST_PROXY all clients share the
 * key 'shared', which gets its own larger cap (start 200/10 min, verify 300/15 min) instead of one tiny global
 * bucket. Status polling is limited per sign-in (login cookie token hash), 60/min. In-memory, per process.
 */
export const startLimiter = createSharedAwareLimiter({ windowMs: 10 * MIN, max: 20, sharedMax: 200 })
export const verifyLimiter = createSharedAwareLimiter({ windowMs: 15 * MIN, max: 20, sharedMax: 300 })
export const statusLimiter = createLimiter({ windowMs: MIN, max: 60, maxTracked: 50_000 })

/** Status-poll limiter key of a sign-in: a hash of its token (raw tokens are not kept in memory). */
export const statusKey = (token: string) => createHash('sha256').update(token).digest('hex')

/** Tests only. */
export function resetAccountApiLimits(): void {
  startLimiter.reset()
  statusLimiter.reset()
  verifyLimiter.reset()
}

/** Browser-binding cookie of a Telegram sign-in: `${token}.${browserSecret}` (both base64url, no dots). */
export const LOGIN_COOKIE = 'customer_login'
export const LOGIN_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/api/account/login',
  maxAge: 10 * 60,
} as const

export function parseLoginCookie(v: string | undefined | null): { token: string; browserSecret: string } | null {
  if (!v) return null
  const m = /^([A-Za-z0-9_-]{16,128})\.([A-Za-z0-9_-]{16,128})$/.exec(v)
  return m ? { token: m[1], browserSecret: m[2] } : null
}

const NO_STORE = { 'cache-control': 'no-store' }

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } })
}
/** Records a successful website sign-in on the customer. Never throws: a failed stamp must not fail the sign-in. */
export async function stampSignIn(customerId: number): Promise<void> {
  try {
    await markSignedIn(customerId, new Date())
  } catch (e) {
    console.error('[account] sign-in stamp failed', e)
  }
}

export const forbidden = () => json({ error: 'FORBIDDEN' }, 403)
export const rateLimited = (retryAfterSec: number) => json({ error: 'RATE_LIMITED' }, 429, { 'retry-after': String(retryAfterSec) })

/** Waits until at least `ms` have passed since `startedAt` (hides timing differences between outcomes). */
export async function padTo(startedAt: number, ms: number): Promise<void> {
  const left = startedAt + ms - Date.now()
  if (left > 0) await new Promise((r) => setTimeout(r, left))
}
