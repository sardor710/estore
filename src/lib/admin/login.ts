import { prisma } from '@/lib/db'
import { bootstrapCredentials, createSession, isSessionConfigured, safeEqual } from '@/lib/auth'
import { hashPassword, verifyPassword } from '@/lib/password'
import { isRole, type Role } from '@/lib/permissions'
import { createLimiter } from '@/lib/rate-limit'
import { logActivity } from './activity'
import { ensureBootstrapAdmin, normalizeEmail } from './users'

// Failed attempts per ip (and globally) per minute; a successful login releases its reservation.
const limiter = createLimiter({ windowMs: 60_000, max: 5, globalMax: 20, maxTracked: 10_000 })

export function resetThrottle(): void {
  limiter.reset()
}

export function trackedIps(): number {
  return limiter.tracked()
}

const MAX_PASSWORD_LENGTH = 200

// Unknown emails are checked against this hash so the response time does not reveal which emails exist.
let dummyHash: Promise<string> | null = null
const getDummyHash = () => (dummyHash ??= hashPassword(crypto.randomUUID()))

export type LoginResult = { status: 200; token: string; role: Role } | { status: 401 } | { status: 429 } | { status: 503 }

async function authenticate(identifier: string, password: string) {
  const email = normalizeEmail(identifier)
  let user = email ? await prisma.adminUser.findUnique({ where: { email } }) : null
  let bootstrapped = false
  if (!user) {
    // .env credentials create the first full admin, and only while no staff accounts exist.
    const boot = bootstrapCredentials()
    if (boot && (await prisma.adminUser.count()) === 0) {
      const [u, p] = await Promise.all([safeEqual(email, normalizeEmail(boot.user)), safeEqual(password, boot.password)])
      if (u && p) {
        user = (await ensureBootstrapAdmin(boot.user, boot.password)) ?? (await prisma.adminUser.findUnique({ where: { email } }))
        bootstrapped = user !== null
      }
    }
  }
  if (!user) {
    await verifyPassword(password, await getDummyHash())
    return null
  }
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok || !user.active || !isRole(user.role)) return null
  return { user: { ...user, role: user.role }, bootstrapped }
}

export async function attemptLogin(input: { email: string; password: string; ip: string; now?: number }): Promise<LoginResult> {
  const now = input.now ?? Date.now()
  if (!isSessionConfigured()) {
    console.error('[admin] login refused: set SESSION_SECRET (>= 32 random chars, not an example value) in .env')
    return { status: 503 }
  }
  if (!bootstrapCredentials() && (await prisma.adminUser.count()) === 0) {
    console.error('[admin] login refused: no staff accounts yet; set ADMIN_USER and ADMIN_PASSWORD (>= 10 chars) in .env or run npm run admin:reset')
    return { status: 503 }
  }
  const slot = limiter.reserve(input.ip, now)
  if (slot === null) return { status: 429 }
  // Oversized passwords are refused before any scrypt work (cheap DoS guard); reserved attempt stays counted.
  if (typeof input.password === 'string' && input.password.length > MAX_PASSWORD_LENGTH) return { status: 401 }
  const r = await authenticate(input.email ?? '', input.password ?? '')
  if (!r) return { status: 401 }
  limiter.release(input.ip, slot)
  const { user } = r
  await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date(now) } })
  await logActivity(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    'login',
    'user',
    user.id,
    r.bootstrapped ? 'Signed in (first full admin created from .env credentials)' : 'Signed in',
  )
  return { status: 200, role: user.role, token: await createSession({ uid: user.id, role: user.role, sv: user.sessionVersion }) }
}

/** Whether a login can succeed at all (for the login form's "not configured" notice). */
export async function isLoginConfigured(): Promise<boolean> {
  return isSessionConfigured() && (bootstrapCredentials() !== null || (await prisma.adminUser.count()) > 0)
}
