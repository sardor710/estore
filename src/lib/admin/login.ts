import { checkCredentials, createSession, isAdminConfigured } from '@/lib/auth'

const WINDOW_MS = 60_000
const MAX_FAILURES = 5
const GLOBAL_MAX_FAILURES = 20
const MAX_TRACKED = 10_000

// In-memory (single process). Each attempt is RESERVED synchronously before any await, so a
// concurrent burst cannot all pass the check; a successful login releases its reservation.
const failures = new Map<string, number[]>()
let globalFailures: number[] = []

export function resetThrottle(): void {
  failures.clear()
  globalFailures = []
}

export function trackedIps(): number {
  return failures.size
}

const live = (list: number[], now: number) => list.filter((t) => now - t < WINDOW_MS)

function reserve(ip: string, now: number): boolean {
  globalFailures = live(globalFailures, now)
  const list = live(failures.get(ip) ?? [], now)
  if (list.length >= MAX_FAILURES || globalFailures.length >= GLOBAL_MAX_FAILURES) {
    if (list.length) failures.set(ip, list)
    return false
  }
  if (!failures.has(ip) && failures.size >= MAX_TRACKED) {
    for (const [k, v] of failures) if (live(v, now).length === 0) failures.delete(k)
    // still full: evict oldest-inserted keys
    for (const k of failures.keys()) {
      if (failures.size < MAX_TRACKED) break
      failures.delete(k)
    }
  }
  failures.delete(ip) // re-insert so Map order approximates recency
  failures.set(ip, [...list, now])
  globalFailures.push(now)
  return true
}

function release(ip: string, now: number): void {
  const list = failures.get(ip)
  if (list) {
    const i = list.lastIndexOf(now)
    if (i >= 0) list.splice(i, 1)
    if (list.length === 0) failures.delete(ip)
  }
  const g = globalFailures.lastIndexOf(now)
  if (g >= 0) globalFailures.splice(g, 1)
}

export type LoginResult = { status: 200; token: string } | { status: 401 } | { status: 429 } | { status: 503 }

export async function attemptLogin(input: { user: string; password: string; ip: string; now?: number }): Promise<LoginResult> {
  const now = input.now ?? Date.now()
  if (!isAdminConfigured()) {
    console.error('[admin] login refused: set ADMIN_USER, ADMIN_PASSWORD and SESSION_SECRET (>= 32 chars) in .env')
    return { status: 503 }
  }
  if (!reserve(input.ip, now)) return { status: 429 }
  if (!(await checkCredentials(input.user, input.password))) return { status: 401 }
  release(input.ip, now)
  return { status: 200, token: await createSession(input.user) }
}
