import { createHmac, randomBytes } from 'node:crypto'

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000 // UTC+5, no DST

/** Calendar day (YYYY-MM-DD) in Asia/Tashkent. */
export function tashkentDay(d: Date): string {
  return new Date(d.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10)
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

// Without a usable SESSION_SECRET we fall back to a per-process random key: hashes stay unlinkable
// (privacy-preserving), they just do not survive a restart.
let ephemeral: Buffer | null = null
function baseSecret(): Buffer | string {
  const s = process.env.SESSION_SECRET
  if (s && s.length >= 32) return s
  return (ephemeral ??= randomBytes(32))
}

/**
 * Anonymous per-day visitor id: HMAC-SHA256(ip|ua) keyed by HMAC(SESSION_SECRET, day), 32 hex chars.
 * The key rotates daily, so the same person cannot be linked across days, and the raw ip is never stored.
 */
export async function visitorHash(ip: string, ua: string, day: string): Promise<string> {
  const dayKey = createHmac('sha256', baseSecret()).update(`visitor:${day}`).digest()
  return createHmac('sha256', dayKey).update(`${ip}|${ua}`).digest('hex').slice(0, 32)
}
