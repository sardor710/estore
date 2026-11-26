import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { adminApi } from '@/lib/admin/api'
import { logActivity } from '@/lib/admin/activity'
import { settleOrder } from '@/lib/payments/service'
import { notifyOrderPaid } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

/** "Check status": ask Octo about the order's open payment attempts now. */
export const POST = adminApi<{ params: Promise<{ id: string }> }>('orders', async (_req, ctx, staff) => {
  const id = Number((await ctx.params).id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 })
  await settleOrder(id, { notifyPaid: (oid) => notifyOrderPaid(oid) })
  const o = await prisma.order.findUnique({ where: { id }, select: { paymentStatus: true } })
  if (!o) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  await logActivity(staff, 'payment', 'order', id, `Checked card payment status: ${o.paymentStatus}`)
  return NextResponse.json({ ok: true, paymentStatus: o.paymentStatus })
})
