import { getSettings } from '@/lib/settings'
import { formatUzs } from '@/lib/money'

export type NotifyOrder = {
  number: number
  name: string
  phone: string
  region: string
  address: string
  comment?: string | null
  totalUzs: number
  lines: { productTitle: string; variantName: string; qty: number; priceUzs: number }[]
  /** Map link when the customer attached a delivery pin. */
  mapUrl?: string | null
  /** CASH (default) = on delivery; CARD = online via Octo, payment confirmed separately (notifyOrderPaid). */
  payMethod?: 'CASH' | 'CARD'
}

export type NotifyResult = 'sent' | 'skipped' | 'failed'

function summary(o: NotifyOrder): string {
  const lines = o.lines.map(
    (l) => `- ${l.productTitle}${l.variantName ? ` (${l.variantName})` : ''} x${l.qty} = ${formatUzs(l.priceUzs * l.qty, 'uz')}`,
  )
  return [
    `New order #${o.number}`,
    `Name: ${o.name}`,
    `Phone: ${o.phone}`,
    `Region: ${o.region}`,
    `Address: ${o.address}`,
    ...(o.mapUrl ? [`Map: ${o.mapUrl}`] : []),
    ...(o.comment ? [`Comment: ${o.comment}`] : []),
    '',
    ...lines,
    '',
    `Total: ${formatUzs(o.totalUzs, 'uz')}`,
    o.payMethod === 'CARD' ? 'Payment: card (Octo), awaiting payment' : 'Payment: cash on delivery',
  ].join('\n')
}

/** Posts plain text to the configured Telegram chat. Never throws. 'skipped' when not configured. */
export async function sendTelegramText(text: string, fetchImpl: typeof fetch = fetch): Promise<NotifyResult> {
  try {
    const { telegramBotToken, telegramChatId } = await getSettings()
    if (!telegramBotToken || !telegramChatId) return 'skipped'
    const res = await fetchImpl(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramChatId, text }),
      signal: AbortSignal.timeout(8000),
    })
    return res.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}

/** Posts a plain-text order summary to Telegram. Never throws. 'skipped' when not configured. */
export async function notifyNewOrder(order: NotifyOrder, fetchImpl: typeof fetch = fetch): Promise<NotifyResult> {
  return sendTelegramText(summary(order), fetchImpl)
}

/** "Order #N paid by card" to the shop's Telegram chat, once per paid order (called by the payment service). */
export async function notifyOrderPaid(orderId: number, fetchImpl: typeof fetch = fetch): Promise<NotifyResult> {
  const { prisma } = await import('@/lib/db')
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: { number: true, status: true, totalUzs: true, payments: { where: { status: 'succeeded' }, orderBy: { id: 'desc' }, take: 1 } },
  })
  if (!o) return 'skipped'
  const p = o.payments[0]
  const card = p ? [p.cardVendor, p.maskedPan].filter(Boolean).join(' ') : ''
  const lines = [`Order #${o.number} paid by card: ${formatUzs(o.totalUzs, 'uz')}${card ? ` (${card})` : ''}`]
  if (p?.test) lines.push('TEST payment (Octo test mode): no real money was taken.')
  if (o.status === 'CANCELLED') lines.push('⚠️ ORDER IS CANCELLED: refund this payment from the admin order page.')
  return sendTelegramText(lines.join('\n'), fetchImpl)
}
