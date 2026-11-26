import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/db'
import { readJsonBody } from '@/lib/body-limit'
import { clientKey, createLimiter } from '@/lib/rate-limit'
import { isJsonContentType, isSameOrigin } from '@/lib/admin/csrf'
import { startCardPayment } from '@/lib/payments/service'
import { livePaymentDeps } from '@/lib/payments/live'

export const dynamic = 'force-dynamic'

const limiter = createLimiter({ windowMs: 10 * 60_000, max: 20 })

const sameToken = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** "Pay now" / "Try again" on the order page: a new Octo payment attempt for a card order, unlocked by its link token. */
export async function POST(req: Request) {
  if (!isSameOrigin(req.headers, 'POST')) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  if (!isJsonContentType(req.headers)) return NextResponse.json({ error: 'UNSUPPORTED_MEDIA_TYPE' }, { status: 415 })
  if (limiter.reserve(clientKey(req.headers)) === null) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 })
  const body = await readJsonBody(req)
  const b = body.ok ? (body.value as Record<string, unknown> | null) : null
  const number = Number(b?.number)
  const token = typeof b?.token === 'string' ? b.token : ''
  if (!Number.isInteger(number) || !token) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const order = await prisma.order.findUnique({ where: { number }, select: { id: true, status: true, payToken: true, payMethod: true, paymentStatus: true } })
  if (!order || order.payMethod !== 'CARD' || !order.payToken || !sameToken(order.payToken, token)) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }
  if (order.status === 'CANCELLED' || order.status === 'DELIVERED') return NextResponse.json({ error: 'ORDER_CLOSED' }, { status: 409 })
  if (order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED') return NextResponse.json({ error: 'ALREADY_PAID' }, { status: 409 })
  try {
    const { payUrl } = await startCardPayment(order.id, livePaymentDeps)
    return NextResponse.json({ payUrl })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'ALREADY_PAID' || msg === 'ORDER_CLOSED') return NextResponse.json({ error: msg }, { status: 409 })
    if (msg === 'TOO_MANY_ATTEMPTS') return NextResponse.json({ error: 'TOO_MANY_ATTEMPTS' }, { status: 429 })
    console.error('[octo] pay start failed', msg)
    return NextResponse.json({ error: 'PAYMENT_UNAVAILABLE' }, { status: 502 })
  }
}
