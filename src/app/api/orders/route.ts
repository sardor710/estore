import { NextResponse } from 'next/server'
import { createOrder } from '@/lib/orders'
import { locales, defaultLocale, type Locale } from '@/i18n/routing'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let b: Record<string, unknown>
  try {
    b = await req.json()
  } catch {
    return NextResponse.json({ error: 'INVALID' }, { status: 400 })
  }
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'INVALID' }, { status: 400 })
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const locale = (locales as readonly string[]).includes(b.locale as string) ? (b.locale as Locale) : defaultLocale
  // Only whitelisted fields are read: client-sent prices/totals are never looked at.
  const result = await createOrder({
    lines: Array.isArray(b.lines) ? (b.lines as { variantId: number; qty: number }[]).map((l) => ({ variantId: l?.variantId, qty: l?.qty })) : [],
    name: str(b.name),
    phone: str(b.phone),
    region: str(b.region),
    address: str(b.address),
    comment: str(b.comment),
    locale,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ number: result.number }, { status: 201 })
}
