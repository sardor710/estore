import Link from 'next/link'
import { listOrders, orderCounts, isOrderStatus, ORDER_STATUSES } from '@/lib/admin/orders'
import { formatUzs } from '@/lib/money'
import { ShoppingBag } from 'lucide-react'
import { Badge, EmptyState, PageHeader } from '@/components/admin/ui'
import { requirePermission } from '@/lib/admin/session'

export const metadata = { title: 'Orders' }

const STATUS_TONE = { NEW: 'blue', CONFIRMED: 'amber', SHIPPING: 'violet', DELIVERED: 'green', CANCELLED: 'red' } as const

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission('orders')
  const { status } = await searchParams
  const active = isOrderStatus(status) ? status : undefined
  const [orders, counts] = await Promise.all([listOrders(active), orderCounts()])
  const tabs = [{ key: undefined, label: 'All', n: counts.ALL }, ...ORDER_STATUSES.map((s) => ({ key: s as string | undefined, label: s, n: counts[s] }))]

  return (
    <>
      <PageHeader title="Orders" />
      <div className="mb-4 inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1" role="tablist" aria-label="Filter by status">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.key ? `/admin/orders?status=${t.key}` : '/admin/orders'}
            role="tab"
            aria-selected={active === t.key}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              active === t.key ? 'bg-white text-indigo-700 shadow-xs ring-1 ring-neutral-200' : 'text-neutral-600 hover:bg-white/70 hover:text-neutral-900'
            }`}
          >
            {t.label} <span className={active === t.key ? 'text-indigo-600/80' : 'text-neutral-500'}>({t.n})</span>
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <EmptyState icon={ShoppingBag} title={`No orders${active ? ` with status ${active}` : ''} yet.`} />
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-neutral-50 sm:px-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900">#{o.number}</span>
                    <Badge tone={STATUS_TONE[o.status as keyof typeof STATUS_TONE] ?? 'neutral'}>{o.status}</Badge>
                    {o.payMethod === 'CARD' && (
                      <Badge tone={o.paymentStatus === 'PAID' ? 'green' : o.paymentStatus === 'REFUNDED' ? 'neutral' : o.paymentStatus === 'FAILED' ? 'red' : 'amber'}>
                        {o.paymentStatus === 'PAID' ? 'Paid by card' : o.paymentStatus === 'REFUNDED' ? 'Refunded' : o.paymentStatus === 'FAILED' ? 'Card payment failed' : 'Awaiting card payment'}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 truncate text-sm text-neutral-600">
                    {o.name} · {o.phone} · {o.lines.reduce((n, l) => n + l.qty, 0)} items
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums text-neutral-900">{formatUzs(o.totalUzs, 'en')}</div>
                  <div className="text-xs text-neutral-500">{o.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
