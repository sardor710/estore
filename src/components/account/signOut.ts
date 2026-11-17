import type { Locale } from '@/i18n/routing'
import { path } from '@/lib/paths'

/**
 * Signs this browser out (optionally every session of the account) and reloads on the home page, so the
 * server-rendered header and favorites reflect the signed-out state. Returns false when the request failed.
 */
export async function signOut(locale: Locale, everywhere = false): Promise<boolean> {
  try {
    const res = await fetch('/api/account/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ everywhere }),
    })
    // A 500 still clears this browser's cookie; only "everywhere" could have failed.
    if (!res.ok && everywhere) return false
  } catch {
    return false
  }
  window.location.assign(path(locale))
  return true
}

/** Login URL that returns to the page the shopper is on now. */
export function loginHref(locale: Locale, current?: string): string {
  const here = current ?? (typeof window === 'undefined' ? '' : `${window.location.pathname}${window.location.search}`)
  return here ? `${path(locale, '/login')}?next=${encodeURIComponent(here)}` : path(locale, '/login')
}
