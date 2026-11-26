import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/db'
import { settleOrder, type PaymentDeps } from './service'
import { notifyOrderPaid } from '@/lib/telegram'

export type OrderPaymentView = {
  number: number
  token: string
  status: string
  totalUzs: number
  cardVendor: string | null
  maskedPan: string | null
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/**
 * Payment panel data for a card order. Public order page: only with the order-link token (orders are numbered
 * sequentially, so the number alone must reveal nothing). `trusted` = the signed-in owner (account page).
 * A PENDING/FAILED order is first re-checked with Octo, so returning from the payment page shows the real result.
 */
export async function orderPaymentView(
  number: number,
  token: string | null,
  opts: { trusted?: boolean } & PaymentDeps = {},
): Promise<OrderPaymentView | null> {
  const o = await prisma.order.findUnique({ where: { number }, select: { id: true, payMethod: true, payToken: true } })
  if (!o || o.payMethod !== 'CARD' || !o.payToken) return null
  if (!opts.trusted && !(token && same(o.payToken, token))) return null
  await settleOrder(o.id, { fetch: opts.fetch, notifyPaid: opts.notifyPaid ?? ((id) => notifyOrderPaid(id)) })
  const fresh = await prisma.order.findUniqueOrThrow({
    where: { id: o.id },
    select: { number: true, payToken: true, paymentStatus: true, totalUzs: true, payments: { where: { status: 'succeeded' }, orderBy: { id: 'desc' }, take: 1 } },
  })
  const p = fresh.payments[0]
  return {
    number: fresh.number,
    token: fresh.payToken ?? '',
    status: fresh.paymentStatus,
    totalUzs: fresh.totalUzs,
    cardVendor: p?.cardVendor ?? null,
    maskedPan: p?.maskedPan ?? null,
  }
}
