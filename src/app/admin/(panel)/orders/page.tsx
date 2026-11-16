import Link from 'next/link'
import { listOrders, orderCounts, isOrderStatus, ORDER_STATUSES } from '@/lib/admin/orders'
import { formatUzs } from '@/lib/money'
import { Badge, PageTitle, card } from '@/components/admin/ui'

export const metadata = { title: 'Orders' }

const STATUS_TONE = { NEW: 'blue', CONFIRMED: 'amber', DELIVERED: 'green', CANCELLED: 'red' } as const

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  const active = isOrderStatus(status) ? status : undefined
  const [orders, counts] = await Promise.all([listOrders(active), orderCounts()])
  const tabs = [{ key: undefined, label: 'All', n: counts.ALL }, ...ORDER_STATUSES.map((s) => ({ key: s as string | undefined, label: s, n: counts[s] }))]

  return (
    <>
      <PageTitle>Orders</PageTitle>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.key ? `/admin/orders?status=${t.key}` : '/admin/orders'}
            role="tab"
            aria-selected={active === t.key}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              active === t.key ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-300 hover:bg-neutral-100'
            }`}
          >
            {t.label} <span className="opacity-70">({t.n})</span>
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className={`${card} text-sm text-neutral-500`}>No orders{active ? ` with status ${active}` : ''} yet.</div>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/orders/${o.id}`} className={`${card} flex flex-wrap items-center justify-between gap-3 transition hover:border-neutral-400`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-neutral-900">#{o.number}</span>
                    <Badge tone={STATUS_TONE[o.status as keyof typeof STATUS_TONE] ?? 'neutral'}>{o.status}</Badge>
                  </div>
                  <div className="mt-1 truncate text-sm text-neutral-600">
                    {o.name} · {o.phone} · {o.lines.reduce((n, l) => n + l.qty, 0)} items
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-neutral-900">{formatUzs(o.totalUzs, 'en')}</div>
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
