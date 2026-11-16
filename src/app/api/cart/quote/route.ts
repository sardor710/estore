import { NextResponse } from 'next/server'
import { quoteCart } from '@/lib/orders'
import { sanitizeLines } from '@/lib/cart/cart'
import { locales, defaultLocale, type Locale } from '@/i18n/routing'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: { lines?: unknown; locale?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'INVALID' }, { status: 400 })
  }
  const lines = sanitizeLines(body?.lines).slice(0, 100)
  const locale = (locales as readonly string[]).includes(body?.locale as string) ? (body.locale as Locale) : defaultLocale
  const quote = await quoteCart(lines, locale)
  return NextResponse.json(quote)
}
