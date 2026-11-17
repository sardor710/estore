import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/admin/session'
import { getCustomer, type Segment } from '@/lib/customers'
import { getRegion } from '@/lib/regions'
import { formatUzs } from '@/lib/money'
import { tashkentDay } from '@/lib/analytics/visitor'
import { Badge, EmptyState, PageHeader, card } from '@/components/admin/ui'
import BackLink from '@/components/admin/BackLink'
import ClientEditor from '@/components/admin/ClientEditor'

export const metadata = { title: 'Client' }

const SEGMENT_TONE: Record<Segment, 'blue' | 'neutral' | 'amber' | 'red'> = { NEW: 'blue', RETURNING: 'neutral', VIP: 'amber', INACTIVE: 'red' }
const STATUS_TONE = { NEW: 'blue', CONFIRMED: 'amber', SHIPPING: 'violet', DELIVERED: 'green', CANCELLED: 'red' } as const

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('clients')
  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()
  const c = await getCustomer(id)
  if (!c) notFound()
  const region = getRegion(c.region)

  return (
    <>
      <BackLink href="/admin/clients">Clients</BackLink>
      <PageHeader title={c.name} />

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <div className={`${card} space-y-3`}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={SEGMENT_TONE[c.segment]}>{c.segment}</Badge>
              {c.blocked ? <Badge tone="red">Blocked</Badge> : null}
              {c.accountCreatedAt ? <Badge tone="accent">Telegram account since {tashkentDay(c.accountCreatedAt)}</Badge> : null}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Phone</dt>
                <dd className="mt-0.5 font-semibold text-neutral-900">{c.phone}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Region</dt>
                <dd className="mt-0.5 font-semibold text-neutral-900">{region ? (region.name.en ?? c.region) : c.region || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Orders</dt>
                <dd className="mt-0.5 font-semibold text-neutral-900">{c.orders}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Spent</dt>
                <dd className="mt-0.5 font-semibold text-neutral-900">{formatUzs(c.spentUzs, 'en')}</dd>
              </div>
            </dl>
            <p className="text-xs text-neutral-500">Orders and spent count confirmed and delivered orders only.</p>
          </div>

          <div className={card}>
            <h2 className="mb-3 text-base font-semibold text-neutral-900">Order history</h2>
            {c.history.length === 0 ? (
              <EmptyState icon={ShoppingBag} title="No orders." />
            ) : (
              <ul className="divide-y divide-neutral-100">
                {c.history.map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/orders/${o.id}`} className="-mx-2 flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2.5 transition-colors hover:bg-neutral-50">
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-900">#{o.number}</span>
                        <Badge tone={STATUS_TONE[o.status as keyof typeof STATUS_TONE] ?? 'neutral'}>{o.status}</Badge>
                      </span>
                      <span className="text-sm text-neutral-700">
                        {formatUzs(o.totalUzs, 'en')} <span className="ml-2 text-xs text-neutral-500">{tashkentDay(o.createdAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <ClientEditor key={c.id} id={c.id} notes={c.notes} tags={c.tags} blocked={c.blocked} />
      </div>
    </>
  )
}
