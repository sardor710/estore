import { checkCredentials, createSession, isAdminConfigured } from '@/lib/auth'

const WINDOW_MS = 60_000
const MAX_FAILURES = 5

// In-memory per-IP failure log (single-process deployment; resets on restart).
const failures = new Map<string, number[]>()

export function resetThrottle(): void {
  failures.clear()
}

function recent(ip: string, now: number): number[] {
  const list = (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (list.length) failures.set(ip, list)
  else failures.delete(ip)
  return list
}

export type LoginResult = { status: 200; token: string } | { status: 401 } | { status: 429 } | { status: 503 }

export async function attemptLogin(input: { user: string; password: string; ip: string; now?: number }): Promise<LoginResult> {
  const now = input.now ?? Date.now()
  if (!isAdminConfigured()) {
    console.error('[admin] login refused: set ADMIN_USER, ADMIN_PASSWORD and SESSION_SECRET (>= 32 chars) in .env')
    return { status: 503 }
  }
  if (recent(input.ip, now).length >= MAX_FAILURES) return { status: 429 }
  if (!(await checkCredentials(input.user, input.password))) {
    failures.set(input.ip, [...recent(input.ip, now), now])
    return { status: 401 }
  }
  failures.delete(input.ip)
  return { status: 200, token: await createSession(input.user) }
}
