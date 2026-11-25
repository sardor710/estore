import { recordPageView } from '@/lib/analytics/record'
import { allowTrack } from '@/lib/analytics/track-throttle'
import { clientKey } from '@/lib/rate-limit'
import { CUSTOMER_COOKIE, readCookie, visitorAccountFromToken } from '@/lib/account/session'
import { lastSeenIsStale, touchLastSeen } from '@/lib/account/activity'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 2048
const none = () => new Response(null, { status: 204 })

/**
 * Public page-view beacon. It sets no cookie of its own; it only reads the customer session cookie, to store whether
 * the visitor was signed in (never who). Always answers 204: tracking must never surface errors to visitors.
 */
export async function POST(req: Request) {
  try {
    const declared = Number(req.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_BYTES) return none()
    const text = await req.text()
    if (new TextEncoder().encode(text).length > MAX_BYTES) return none()
    const b = JSON.parse(text) as Record<string, unknown> | null
    if (!b || typeof b !== 'object' || typeof b.path !== 'string') return none()

    const key = clientKey(req.headers)
    if (!allowTrack(key)) return none()

    const ownHosts = [new URL(req.url).hostname]
    try {
      if (process.env.SITE_URL) ownHosts.push(new URL(process.env.SITE_URL).hostname)
    } catch {}
    const hostHeader = req.headers.get('host')?.split(':')[0]
    if (hostHeader) ownHosts.push(hostHeader)

    // Guests (no cookie) cost no lookup. A lookup that throws leaves the view "unknown" rather than calling it a guest.
    const token = readCookie(req, CUSTOMER_COOKIE)
    let account: { id: number; region: string; lastSeenAt: Date | null } | null | undefined = null
    if (token) {
      try {
        account = await visitorAccountFromToken(token)
      } catch {
        account = undefined
      }
    }

    const now = new Date()
    const stored = await recordPageView({
      path: b.path,
      locale: typeof b.locale === 'string' ? b.locale : '',
      referrer: typeof b.referrer === 'string' ? b.referrer : '',
      // Without TRUST_PROXY the client ip is unknown ("shared"); the user agent still separates most visitors.
      ip: key,
      ua: req.headers.get('user-agent') ?? '',
      now,
      ownHosts,
      account,
    })
    // "Last seen" moves at most once per 5-minute slot; the row read above tells us when no write is needed.
    if (stored && account && lastSeenIsStale(account.lastSeenAt, now)) await touchLastSeen(account.id, now)
  } catch {
    // swallow: bad JSON, DB hiccup, ...
  }
  return none()
}
