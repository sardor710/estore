import { NextResponse } from 'next/server'
import { readJsonBody } from '@/lib/body-limit'
import { settlePayment } from '@/lib/payments/service'
import { notifyOrderPaid } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

/**
 * Octo payment callback. Only shop_transaction_id is read from the body; the real status always comes from
 * our own status request to Octo (settlePayment), so a forged callback cannot mark an order paid.
 * Always answers 200 so Octo does not keep retrying for ids that are not ours.
 */
export async function POST(req: Request) {
  try {
    const body = await readJsonBody(req)
    const b = body.ok ? (body.value as Record<string, unknown> | null) : null
    const tx = b && typeof b === 'object' && typeof b.shop_transaction_id === 'string' ? b.shop_transaction_id : ''
    if (/^zanko-\d{1,9}-\d{1,3}$/.test(tx)) {
      await settlePayment(tx, { notifyPaid: (id) => notifyOrderPaid(id) })
    }
  } catch (e) {
    console.error('[octo] notify failed', e instanceof Error ? e.message : e)
  }
  return NextResponse.json({ ok: true })
}
