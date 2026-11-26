import { NextResponse } from 'next/server'
import { createOrder } from '@/lib/orders'
import { notifyNewOrder } from '@/lib/telegram'
import { notifyOrderPlaced } from '@/lib/account/notify'
import { locales, defaultLocale, type Locale } from '@/i18n/routing'
import { readJsonBody } from '@/lib/body-limit'
import { clientKey } from '@/lib/rate-limit'
import { orderLimiter } from '@/lib/order-throttle'
import { runAfterResponse } from '@/lib/after-response'
import { isJsonContentType, isSameOrigin } from '@/lib/admin/csrf'
import { CUSTOMER_COOKIE, customerFromToken, readCookie } from '@/lib/account/session'
import { octoConfig } from '@/lib/payments/octo'
import { startCardPayment } from '@/lib/payments/service'
import { notifyOrderPaid } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // The Telegram Mini App session cookie is SameSite=None: refuse cross-site requests and non-JSON (form) posts.
  if (!isSameOrigin(req.headers, 'POST')) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  if (!isJsonContentType(req.headers)) return NextResponse.json({ error: 'UNSUPPORTED_MEDIA_TYPE' }, { status: 415 })
  try {
    const body = await readJsonBody(req)
    if (!body.ok) return NextResponse.json({ error: body.status === 413 ? 'TOO_LARGE' : 'INVALID' }, { status: body.status })
    const b = body.value as Record<string, unknown> | null
    if (!b || typeof b !== 'object' || Array.isArray(b)) return NextResponse.json({ error: 'INVALID' }, { status: 400 })

    const card = b.payment === 'card'
    // Card chosen but Octo not configured: refuse before anything is created (the checkout hides the option then).
    if (card && !octoConfig()) return NextResponse.json({ error: 'CARD_UNAVAILABLE' }, { status: 400 })

    const key = clientKey(req.headers)
    const slot = orderLimiter.reserve(key)
    if (slot === null) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429, headers: { 'retry-after': '600' } })

    const str = (v: unknown) => (typeof v === 'string' ? v : '')
    const locale = (locales as readonly string[]).includes(b.locale as string) ? (b.locale as Locale) : defaultLocale
    // Signed-in shopper: the order phone is the account phone (body phone ignored), so it shows in the account.
    const account = await customerFromToken(readCookie(req, CUSTOMER_COOKIE))
    const rawSave = b.saveAddress as { label?: unknown } | null | undefined
    const saveAddress = account && rawSave && typeof rawSave === 'object' && !Array.isArray(rawSave) ? { label: str(rawSave.label) } : null
    // Only whitelisted fields are read: client-sent prices/totals are never looked at.
    let result
    try {
      result = await createOrder(
        {
          lines: Array.isArray(b.lines) ? (b.lines as { variantId: number; qty: number }[]).map((l) => ({ variantId: l?.variantId, qty: l?.qty })) : [],
          name: str(b.name),
          phone: account ? account.phone : str(b.phone),
          region: str(b.region),
          address: str(b.address),
          comment: str(b.comment),
          locale,
          location: b.location && typeof b.location === 'object' && !Array.isArray(b.location) ? (b.location as { lat?: unknown; lng?: unknown }) : null,
          ...(account ? { accountCustomerId: account.id, saveAddress } : {}),
          payMethod: card ? 'CARD' : 'CASH',
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
    const placedNumber = result.number
    runAfterResponse(() => notifyOrderPlaced(placedNumber)) // customer's 'order received' in Telegram (linked accounts only)
    if (card) {
      // The order exists either way; if Octo fails the customer gets "Try again" on the order page.
      try {
        const { payUrl } = await startCardPayment(result.id, { notifyPaid: (id) => notifyOrderPaid(id) })
        return NextResponse.json({ number: result.number, token: result.payToken, payUrl }, { status: 201 })
      } catch (e) {
        console.error('[orders] Octo payment start failed', e instanceof Error ? e.message : e)
        return NextResponse.json({ number: result.number, token: result.payToken, payError: true }, { status: 201 })
      }
    }
    return NextResponse.json({ number: result.number }, { status: 201 })
  } catch (e) {
    console.error('[orders] create failed', e)
    return NextResponse.json({ error: 'SERVER' }, { status: 500 })
  }
}
