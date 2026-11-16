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
    ...(o.comment ? [`Comment: ${o.comment}`] : []),
    '',
    ...lines,
    '',
    `Total: ${formatUzs(o.totalUzs, 'uz')}`,
  ].join('\n')
}

/** Posts a plain-text order summary to Telegram. Never throws. 'skipped' when not configured. */
export async function notifyNewOrder(order: NotifyOrder, fetchImpl: typeof fetch = fetch): Promise<NotifyResult> {
  try {
    const { telegramBotToken, telegramChatId } = await getSettings()
    if (!telegramBotToken || !telegramChatId) return 'skipped'
    const res = await fetchImpl(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramChatId, text: summary(order) }),
      signal: AbortSignal.timeout(8000),
    })
    return res.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}
