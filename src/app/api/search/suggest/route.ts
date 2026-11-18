import { hasLocale } from 'next-intl'
import { routing } from '@/i18n/routing'
import { clientKey } from '@/lib/rate-limit'
import { suggest } from '@/lib/search/service'
import { suggestLimiter } from '@/lib/search/limit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/search/suggest?q=&locale= -> { products: [...≤6], categories: [...≤3] } for the header search field.
 * Unknown locale falls back to the default; q under 2 characters (after trim) -> empty lists.
 * Limit: 120 requests/min per client (429 + Retry-After: 60).
 */
export async function GET(req: Request) {
  if (suggestLimiter.reserve(clientKey(req.headers)) === null) {
    return Response.json({ error: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } })
  }
  const url = new URL(req.url)
  const raw = url.searchParams.get('locale') ?? ''
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale
  const data = await suggest(url.searchParams.get('q') ?? '', locale)
  return Response.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
