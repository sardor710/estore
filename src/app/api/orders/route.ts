import { NextResponse } from 'next/server'
import { createOrder } from '@/lib/orders'
import { notifyNewOrder } from '@/lib/telegram'
import { locales, defaultLocale, type Locale } from '@/i18n/routing'
import { readJsonBody } from '@/lib/body-limit'
import { clientKey } from '@/lib/rate-limit'
import { orderLimiter } from '@/lib/order-throttle'
import { runAfterResponse } from '@/lib/after-response'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await readJsonBody(req)
    if (!body.ok) return NextResponse.json({ error: body.status === 413 ? 'TOO_LARGE' : 'INVALID' }, { status: body.status })
    const b = body.value as Record<string, unknown> | null
    if (!b || typeof b !== 'object' || Array.isArray(b)) return NextResponse.json({ error: 'INVALID' }, { status: 400 })

    const key = clientKey(req.headers)
    const slot = orderLimiter.reserve(key)
    if (slot === null) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429, headers: { 'retry-after': '600' } })

    const str = (v: unknown) => (typeof v === 'string' ? v : '')
    const locale = (locales as readonly string[]).includes(b.locale as string) ? (b.locale as Locale) : defaultLocale
    // Only whitelisted fields are read: client-sent prices/totals are never looked at.
    let result
    try {
      result = await createOrder(
        {
          lines: Array.isArray(b.lines) ? (b.lines as { variantId: number; qty: number }[]).map((l) => ({ variantId: l?.variantId, qty: l?.qty })) : [],
          name: str(b.name),
          phone: str(b.phone),
          region: str(b.region),
          address: str(b.address),
          comment: str(b.comment),
          locale,
        },
        // Telegram runs after the response (kept alive by the platform), never delaying or failing the order.
        { notify: (o) => runAfterResponse(() => notifyNewOrder(o)) },
      )
    } catch (e) {
      orderLimiter.release(key, slot)
      throw e
    }
    if (!result.ok) {
      orderLimiter.release(key, slot) // only placed orders count towards the limit
      return NextResponse.json({ error: result.error }, { status: result.error === 'BLOCKED' ? 403 : 400 })
    }
    return NextResponse.json({ number: result.number }, { status: 201 })
  } catch (e) {
    console.error('[orders] create failed', e)
    return NextResponse.json({ error: 'SERVER' }, { status: 500 })
  }
}
