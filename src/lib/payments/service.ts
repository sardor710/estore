import { prisma } from '@/lib/db'
import { SITE_URL } from '@/lib/seo'
import { octoConfig, octoPrepare, octoStatus, octoRefund } from './octo'

/**
 * Card payments through Octo's hosted page. An order is marked PAID only after we ask Octo for the
 * status ourselves (octoStatus); callback bodies are never trusted. Order.paymentStatus:
 * UNPAID (cash) | PENDING | PAID | FAILED | REFUNDED.
 */
export type PaymentDeps = {
  fetch?: typeof fetch
  notifyPaid?: (orderId: number) => unknown
  /** Urgent message to the shop (Telegram): e.g. an order paid twice. */
  alert?: (text: string) => unknown
}

export const MAX_ATTEMPTS = 10
/** Octo statuses that may still turn into a payment. */
const OPEN = ['created', 'wait_user_action', 'waiting_user_action', 'waiting_for_capture']
/** Octo statuses that end an attempt without payment. Anything unknown stays open (re-checked later). */
const FINAL_FAIL = ['canceled', 'cancelled']
/** An open attempt younger than this is reused by "Pay now" (Octo's page lives 30 min): one payable link at a time. */
const REUSE_MS = 25 * 60_000
const CLOSED_ORDER = ['CANCELLED', 'DELIVERED']

const safely = async (fn: (() => unknown) | undefined) => {
  try {
    await fn?.()
  } catch {
    /* notifications never break payments */
  }
}

const langOf = (locale: string): 'uz' | 'ru' | 'en' => (locale === 'ru' || locale === 'en' ? locale : 'uz')

/** Starts a new payment attempt for a card order and returns Octo's payment page URL. */
export async function startCardPayment(orderId: number, deps: PaymentDeps = {}): Promise<{ payUrl: string }> {
  const before = await prisma.order.findUniqueOrThrow({ where: { id: orderId } })
  if (CLOSED_ORDER.includes(before.status)) throw new Error('ORDER_CLOSED')
  if (before.paymentStatus === 'PAID' || before.paymentStatus === 'REFUNDED') throw new Error('ALREADY_PAID')
  // A stale tab may still offer "Pay now" after the customer paid elsewhere: ask Octo about open attempts first.
  await settleOrder(orderId, deps)
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } })
  if (order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED') throw new Error('ALREADY_PAID')
  const fresh = await prisma.payment.findFirst({
    where: { orderId, status: { in: OPEN }, payUrl: { not: null }, createdAt: { gt: new Date(Date.now() - REUSE_MS) } },
    orderBy: { id: 'desc' },
  })
  if (fresh?.payUrl) return { payUrl: fresh.payUrl }
  const attempts = await prisma.payment.count({ where: { orderId } })
  if (attempts >= MAX_ATTEMPTS) throw new Error('TOO_MANY_ATTEMPTS')

  const shopTransactionId = `zanko-${order.number}-${attempts + 1}`
  const payment = await prisma.payment.create({ data: { orderId, shopTransactionId, amountUzs: order.totalUzs, test: octoConfig()?.test ?? false } })
  const lang = langOf(order.locale)
  try {
    const r = await octoPrepare(
      {
        shopTransactionId,
        amountUzs: order.totalUzs,
        description: `Zanko order #${order.number}`,
        returnUrl: `${SITE_URL}/${lang}/order/${order.number}?t=${order.payToken ?? ''}`,
        notifyUrl: `${SITE_URL}/api/payments/octo/notify`,
        language: lang === 'uz' ? 'oz' : lang, // the site's Uzbek is Latin; Octo's "uz" is Cyrillic
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
    // Nothing payable left: show "Payment failed / Try again" instead of "Waiting for payment".
    const open = await prisma.payment.count({ where: { orderId, status: { in: OPEN } } })
    if (open === 0) await prisma.order.updateMany({ where: { id: orderId, paymentStatus: 'PENDING' }, data: { paymentStatus: 'FAILED' } })
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
    if (flipped.count > 0) await safely(deps.notifyPaid && (() => deps.notifyPaid!(pay.orderId)))
    else {
      const other = await prisma.payment.count({ where: { orderId: pay.orderId, status: 'succeeded', id: { not: pay.id } } })
      if (other > 0) {
        const text = `⚠️ Order #${pay.order.number} was paid TWICE. Refund the extra payment ${shopTransactionId} (${pay.amountUzs} UZS) in the Octo cabinet.`
        console.error(`[payments] ${text}`)
        await safely(deps.alert && (() => deps.alert!(text)))
      }
    }
    return 'PAID'
  }
  if (OPEN.includes(s.status)) {
    if (s.status !== pay.status) await prisma.payment.update({ where: { id: pay.id }, data: { status: s.status } })
    return 'PENDING'
  }
  if (!FINAL_FAIL.includes(s.status)) {
    // Unknown status word: keep the attempt open so it is checked again; never guess "failed".
    console.error(`[payments] unexpected Octo status "${s.status}" for ${shopTransactionId}`)
    return 'PENDING'
  }
  await prisma.payment.update({ where: { id: pay.id }, data: { status: 'canceled' } })
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
