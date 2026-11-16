import { NextResponse } from 'next/server'
import { adminApi } from '@/lib/admin/api'
import { isOrderStatus } from '@/lib/admin/orders'
import { setOrderStatus } from '@/lib/orders'

export const dynamic = 'force-dynamic'

export const POST = adminApi<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const id = Number((await ctx.params).id)
  const body = (await req.json().catch(() => null)) as { to?: unknown } | null
  if (!Number.isInteger(id) || !isOrderStatus(body?.to)) return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 })
  const r = await setOrderStatus(id, body.to)
  if (r.ok) return NextResponse.json({ ok: true })
  return NextResponse.json({ error: r.error }, { status: 409 })
})
