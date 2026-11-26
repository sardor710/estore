import { NextResponse } from 'next/server'
import { adminApi } from '@/lib/admin/api'
import { logActivity } from '@/lib/admin/activity'
import { refundOrder } from '@/lib/payments/service'

export const dynamic = 'force-dynamic'

/** Full refund of a card-paid order through Octo. */
export const POST = adminApi<{ params: Promise<{ id: string }> }>('orders', async (_req, ctx, staff) => {
  const id = Number((await ctx.params).id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 })
  try {
    const r = await refundOrder(id)
    await logActivity(staff, 'payment', 'order', id, r.status === 'REFUNDED' ? 'Refunded card payment (Octo)' : 'Refund requested, pending at Octo')
    return NextResponse.json({ ok: true, status: r.status })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg === 'NOT_PAID' ? 'NOT_PAID' : 'REFUND_FAILED', message: msg }, { status: 409 })
  }
})
