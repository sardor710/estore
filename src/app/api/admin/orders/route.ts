import { NextResponse } from 'next/server'
import { adminApi } from '@/lib/admin/api'
import { listOrders } from '@/lib/admin/orders'

export const dynamic = 'force-dynamic'

export const GET = adminApi('orders', async (req) => {
  const orders = await listOrders(req.nextUrl.searchParams.get('status') ?? undefined)
  return NextResponse.json({ orders })
})
