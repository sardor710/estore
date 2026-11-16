import { prisma } from '@/lib/db'
import { allowedTransitions, type OrderStatus } from '@/lib/orders'

export const ORDER_STATUSES: OrderStatus[] = ['NEW', 'CONFIRMED', 'DELIVERED', 'CANCELLED']

export function isOrderStatus(s: unknown): s is OrderStatus {
  return typeof s === 'string' && (ORDER_STATUSES as string[]).includes(s)
}

export async function listOrders(status?: string) {
  return prisma.order.findMany({
    where: isOrderStatus(status) ? { status } : {},
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { lines: true },
  })
}

export async function orderCounts(): Promise<Record<OrderStatus | 'ALL', number>> {
  const rows = await prisma.order.groupBy({ by: ['status'], _count: { _all: true } })
  const out = { ALL: 0, NEW: 0, CONFIRMED: 0, DELIVERED: 0, CANCELLED: 0 }
  for (const r of rows) {
    if (isOrderStatus(r.status)) out[r.status] = r._count._all
    out.ALL += r._count._all
  }
  return out
}

export { allowedTransitions }
