import { createHmac, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000 // UTC+5, no DST

/** Calendar day (YYYY-MM-DD) in Asia/Tashkent. */
export function tashkentDay(d: Date): string {
  return new Date(d.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10)
}

/** Wall clock in Asia/Tashkent, `YYYY-MM-DD HH:mm`. */
export function tashkentDateTime(d: Date): string {
  const iso = new Date(d.getTime() + TASHKENT_OFFSET_MS).toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}

const BOT_RE = /bot|crawl|spider|slurp|preview|headless|lighthouse/i

/** Crawlers, link-preview fetchers and headless browsers. An empty user agent counts as a bot. */
export function isBot(ua: string): boolean {
  return ua.trim() === '' || BOT_RE.test(ua)
}

export type Device = 'mobile' | 'tablet' | 'desktop'

export function deviceOf(ua: string): Device {
  if (/ipad|tablet|playbook|silk/i.test(ua)) return 'tablet'
  // Android without the "Mobile" token is a tablet.
  if (/android/i.test(ua) && !/mobile/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android|windows phone/i.test(ua)) return 'mobile'
  return 'desktop'
}

export const SALT_PREFIX = 'visitorSalt:'
const salts = new Map<string, string>() // per-process cache

/**
 * The random 32-byte salt of a Tashkent day, stored in Setting (key visitorSalt:<day>), created on first use.
 * The insert is a no-op upsert, so concurrent first requests (or processes) all end up reading the same row.
 * rollupAndPrune deletes the salts of finished days, which makes older hashes impossible to recompute.
 */
async function saltFor(day: string): Promise<string> {
  const cached = salts.get(day)
  if (cached) return cached
  const key = SALT_PREFIX + day
  const row = await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: randomBytes(32).toString('hex') } })
  salts.set(day, row.value)
  return row.value
}

/** Forget cached salts of days before `today` (called after their rows were deleted). */
export function forgetSaltsBefore(today: string): void {
  for (const d of salts.keys()) if (d < today) salts.delete(d)
}

/**
 * Anonymous per-day visitor id: HMAC-SHA256(ip|ua) keyed by that day's random salt, 32 hex chars.
 * Not derivable from any secret, not linkable across days, and unrecoverable once the day's salt is deleted.
 */
export async function visitorHash(ip: string, ua: string, day: string): Promise<string> {
  return createHmac('sha256', await saltFor(day)).update(`${ip}|${ua}`).digest('hex').slice(0, 32)
}
