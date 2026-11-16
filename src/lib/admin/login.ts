import { checkCredentials, createSession, isAdminConfigured } from '@/lib/auth'
import { createLimiter } from '@/lib/rate-limit'

// Failed attempts per ip (and globally) per minute; a successful login releases its reservation.
const limiter = createLimiter({ windowMs: 60_000, max: 5, globalMax: 20, maxTracked: 10_000 })

export function resetThrottle(): void {
  limiter.reset()
}

export function trackedIps(): number {
  return limiter.tracked()
}

export type LoginResult = { status: 200; token: string } | { status: 401 } | { status: 429 } | { status: 503 }

export async function attemptLogin(input: { user: string; password: string; ip: string; now?: number }): Promise<LoginResult> {
  const now = input.now ?? Date.now()
  if (!isAdminConfigured()) {
    console.error('[admin] login refused: set ADMIN_USER, ADMIN_PASSWORD (>= 10 chars) and SESSION_SECRET (>= 32 random chars, not an example value) in .env')
    return { status: 503 }
  }
  const slot = limiter.reserve(input.ip, now)
  if (slot === null) return { status: 429 }
  if (!(await checkCredentials(input.user, input.password))) return { status: 401 }
  limiter.release(input.ip, slot)
  return { status: 200, token: await createSession(input.user) }
}
