import type { Locale } from '@/i18n/routing'
import { safeNext } from '@/lib/account/next'

/** Same-site path to open after the Mini App launch (same rules as the sign-in `next`), else the shop home. */
export function tgSafeNext(next: unknown, locale: Locale): string {
  const fallback = `/${locale}`
  if (typeof next !== 'string' || !next) return fallback
  const ok = safeNext(next, locale)
  return ok === next ? ok : fallback
}

/**
 * Mini App entry URL: every bot button opens `/tg?next=...`, which re-checks Telegram's signed launch data and sets
 * the session + Telegram-mode cookies before showing `next`. Null when the site URL is not an absolute http(s) URL.
 */
export function tgLaunchUrl(next: string, site: string | undefined = process.env.SITE_URL): string | null {
  const base = (site ?? '').trim().replace(/\/+$/, '')
  try {
    const u = new URL(base)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  } catch {
    return null
  }
  return `${base}/tg?next=${encodeURIComponent(next)}`
}

/** Telegram opens web_app buttons only for https URLs. */
export const isHttpsUrl = (u: string | null): u is string => !!u && u.startsWith('https://')
