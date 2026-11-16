const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

function hostOf(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).host.toLowerCase()
  } catch {
    return null
  }
}

/**
 * CSRF check for state-changing requests (on top of the SameSite=Lax cookie).
 * Origin, when present, must match the request Host or SITE_URL. Without Origin, a browser-declared
 * cross-site request (Sec-Fetch-Site) is refused; non-browser clients have no ambient cookies to abuse.
 */
export function isSameOrigin(headers: Headers, method: string): boolean {
  if (SAFE.has(method.toUpperCase())) return true
  const origin = headers.get('origin')
  if (origin) {
    const o = hostOf(origin)
    if (!o) return false
    const allowed = [headers.get('x-forwarded-host') ?? headers.get('host'), hostOf(process.env.SITE_URL ?? '')]
    return allowed.some((h) => h && h.toLowerCase() === o)
  }
  const site = headers.get('sec-fetch-site')
  return !site || site === 'same-origin' || site === 'none'
}
