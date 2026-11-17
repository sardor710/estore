import { recordPageView } from '@/lib/analytics/record'
import { allowTrack } from '@/lib/analytics/track-throttle'
import { clientKey } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 2048
const none = () => new Response(null, { status: 204 })

/** Public, cookie-less page-view beacon. Always answers 204: tracking must never surface errors to visitors. */
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

    await recordPageView({
      path: b.path,
      locale: typeof b.locale === 'string' ? b.locale : '',
      referrer: typeof b.referrer === 'string' ? b.referrer : '',
      // Without TRUST_PROXY the client ip is unknown ("shared"); the user agent still separates most visitors.
      ip: key,
      ua: req.headers.get('user-agent') ?? '',
      now: new Date(),
      ownHosts,
    })
  } catch {
    // swallow: bad JSON, DB hiccup, ...
  }
  return none()
}
