import { prisma } from '@/lib/db'
import { SITE_URL } from '@/lib/seo'
import { octoPrepare, octoStatus, octoRefund } from './octo'

/**
 * Card payments through Octo's hosted page. An order is marked PAID only after we ask Octo for the
 * status ourselves (octoStatus); callback bodies are never trusted. Order.paymentStatus:
 * UNPAID (cash) | PENDING | PAID | FAILED | REFUNDED.
 */
export type PaymentDeps = { fetch?: typeof fetch; notifyPaid?: (orderId: number) => unknown }

export const MAX_ATTEMPTS = 10
/** Octo statuses that may still turn into a payment. */
const OPEN = ['created', 'wait_user_action', 'waiting_user_action', 'waiting_for_capture']

const langOf = (locale: string): 'uz' | 'ru' | 'en' => (locale === 'ru' || locale === 'en' ? locale : 'uz')

/** Starts a new payment attempt for a card order and returns Octo's payment page URL. */
export async function startCardPayment(orderId: number, deps: PaymentDeps = {}): Promise<{ payUrl: string }> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } })
  if (order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED') throw new Error('ALREADY_PAID')
  const attempts = await prisma.payment.count({ where: { orderId } })
  if (attempts >= MAX_ATTEMPTS) throw new Error('TOO_MANY_ATTEMPTS')

  const shopTransactionId = `zanko-${order.number}-${attempts + 1}`
  const payment = await prisma.payment.create({ data: { orderId, shopTransactionId, amountUzs: order.totalUzs } })
  const lang = langOf(order.locale)
  try {
    const r = await octoPrepare(
      {
        shopTransactionId,
        amountUzs: order.totalUzs,
        description: `Zanko order #${order.number}`,
        returnUrl: `${SITE_URL}/${lang}/order/${order.number}?t=${order.payToken ?? ''}`,
        notifyUrl: `${SITE_URL}/api/payments/octo/notify`,
        language: lang,
      },
      deps.fetch,
    )
    await prisma.payment.update({ where: { id: payment.id }, data: { octoPaymentId: r.uuid, payUrl: r.payUrl, status: r.status } })
    await prisma.order.updateMany({
      where: { id: orderId, paymentStatus: { notIn: ['PAID', 'REFUNDED'] } },
      data: { paymentStatus: 'PENDING', paymentProvider: 'octo' },
    })
    return { payUrl: r.payUrl }
  } catch (e) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'error' } })
    throw e
  }
}

/** Asks Octo for one attempt's status and applies it. Safe to call any number of times, concurrently. */
export async function settlePayment(shopTransactionId: string, deps: PaymentDeps = {}): Promise<'PAID' | 'PENDING' | 'FAILED' | 'UNKNOWN'> {
  const pay = await prisma.payment.findUnique({ where: { shopTransactionId }, include: { order: true } })
  if (!pay) return 'UNKNOWN'
  if (pay.status === 'succeeded') return 'PAID'
  if (pay.status === 'error') return pay.order.paymentStatus === 'PAID' ? 'PAID' : 'FAILED'

  const s = await octoStatus(shopTransactionId, deps.fetch)
  if (s.status === 'succeeded') {
    if (s.totalSum !== pay.amountUzs) {
      console.error(`[payments] amount mismatch for ${shopTransactionId}: Octo ${s.totalSum}, order ${pay.amountUzs}`)
      return 'PENDING'
    }
    await prisma.payment.update({
      where: { id: pay.id },
      data: {
        status: 'succeeded',
        octoPaymentId: s.uuid || pay.octoPaymentId,
        maskedPan: s.maskedPan ?? null,
        cardVendor: s.cardVendor ?? null,
        paidAt: new Date(),
      },
    })
    // Conditional update: only one concurrent settle flips the order, so the owner is notified once.
    const flipped = await prisma.order.updateMany({
      where: { id: pay.orderId, paymentStatus: { notIn: ['PAID', 'REFUNDED'] } },
      data: { paymentStatus: 'PAID', paymentProvider: 'octo' },
    })
    if (flipped.count > 0 && deps.notifyPaid) {
      try {
        await deps.notifyPaid(pay.orderId)
      } catch {
        /* a failed notification never undoes a payment */
      }
    }
    return 'PAID'
  }
  if (OPEN.includes(s.status)) {
    if (s.status !== pay.status) await prisma.payment.update({ where: { id: pay.id }, data: { status: s.status } })
    return 'PENDING'
  }
  // canceled (or anything final that is not success)
  await prisma.payment.update({ where: { id: pay.id }, data: { status: s.status === 'canceled' ? 'canceled' : s.status } })
  const succeeded = await prisma.payment.count({ where: { orderId: pay.orderId, status: 'succeeded' } })
  if (succeeded > 0) return 'PAID'
  await prisma.order.updateMany({ where: { id: pay.orderId, paymentStatus: 'PENDING' }, data: { paymentStatus: 'FAILED' } })
  return 'FAILED'
}

/** Settles every still-open attempt of a PENDING order (order page, admin, "Check status"). */
export async function settleOrder(orderId: number, deps: PaymentDeps = {}): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { paymentStatus: true } })
  if (!order || (order.paymentStatus !== 'PENDING' && order.paymentStatus !== 'FAILED')) return
  const open = await prisma.payment.findMany({ where: { orderId, status: { in: OPEN } }, orderBy: { id: 'asc' } })
  for (const p of open) {
    try {
      if ((await settlePayment(p.shopTransactionId, deps)) === 'PAID') return
    } catch (e) {
      console.error('[payments] settle failed', p.shopTransactionId, e instanceof Error ? e.message : e)
    }
  }
}

/** Full refund of a paid order through Octo. */
export async function refundOrder(orderId: number, deps: PaymentDeps = {}): Promise<{ status: 'REFUNDED' | 'REFUND_PENDING' }> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } })
  const pay = await prisma.payment.findFirst({ where: { orderId, status: 'succeeded' }, orderBy: { id: 'desc' } })
  if (order.paymentStatus !== 'PAID' || !pay || !pay.octoPaymentId) throw new Error('NOT_PAID')
  const r = await octoRefund({ uuid: pay.octoPaymentId, refundId: `zanko-r-${order.number}`, amountUzs: pay.amountUzs }, deps.fetch)
  if (r.status === 'failed') throw new Error('REFUND_FAILED')
  if (r.status === 'pending') {
    await prisma.payment.update({ where: { id: pay.id }, data: { refundId: r.refundId } })
    return { status: 'REFUND_PENDING' }
  }
  await prisma.payment.update({ where: { id: pay.id }, data: { refundId: r.refundId, refundedUzs: pay.amountUzs } })
  await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'REFUNDED' } })
  return { status: 'REFUNDED' }
}
