import { NextResponse } from 'next/server'
import { quoteCart } from '@/lib/orders'
import { sanitizeLines } from '@/lib/cart/cart'
import { locales, defaultLocale, type Locale } from '@/i18n/routing'
import { readJsonBody } from '@/lib/body-limit'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const parsed = await readJsonBody(req)
    if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? 'TOO_LARGE' : 'INVALID' }, { status: parsed.status })
    const body = parsed.value as { lines?: unknown; locale?: unknown } | null
    // sanitizeLines bounds variant ids and caps each line at MAX_LINE_QTY.
    const lines = sanitizeLines(body?.lines).slice(0, 100)
    const locale = (locales as readonly string[]).includes(body?.locale as string) ? (body!.locale as Locale) : defaultLocale
    return NextResponse.json(await quoteCart(lines, locale))
  } catch (e) {
    console.error('[quote] failed', e)
    return NextResponse.json({ error: 'SERVER' }, { status: 500 })
  }
}
