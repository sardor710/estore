import Link from 'next/link'
import { requirePermission } from '@/lib/admin/session'
import { CUSTOMERS_PAGE_SIZE, SEGMENTS, isCustomerSort, isSegment, listCustomers, type CustomerSort, type Segment } from '@/lib/customers'
import { formatUzs } from '@/lib/money'
import { getRegion } from '@/lib/regions'
import { tashkentDay } from '@/lib/analytics/visitor'
import { Users } from 'lucide-react'
import { Badge, EmptyState, Label, PageHeader, Toolbar, btn, btnGhost, card, input, table, td, th } from '@/components/admin/ui'

export const metadata = { title: 'Clients' }

type Search = { q?: string; segment?: string; sort?: string; page?: string }

const SEGMENT_TONE: Record<Segment, 'blue' | 'neutral' | 'amber' | 'red'> = { NEW: 'blue', RETURNING: 'neutral', VIP: 'amber', INACTIVE: 'red' }
const SORT_LABEL: Record<CustomerSort, string> = { last: 'Last order', spent: 'Total spent', orders: 'Orders', name: 'Name' }
const sth = `${th} sticky top-0 z-10`

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('clients')
  const sp = await searchParams
  const q = (sp.q ?? '').trim()
  const segment = isSegment(sp.segment) ? sp.segment : undefined
  const sort = isCustomerSort(sp.sort) ? sp.sort : 'last'
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1)
  const { rows, total } = await listCustomers({ q, segment, sort, page })
  const pages = Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE))

  const qs = (over: { page?: number }) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (segment) p.set('segment', segment)
    if (sort !== 'last') p.set('sort', sort)
    if (over.page && over.page > 1) p.set('page', String(over.page))
    return p.toString()
  }
  const exportQs = qs({})

  return (
    <>
      <PageHeader
        title="Clients"
        actions={
          <a href={`/api/admin/clients/export${exportQs ? `?${exportQs}` : ''}`} className={btnGhost}>
            Export CSV
          </a>
        }
      />

      <Toolbar>
      <form method="get" className="contents">
        <label className="min-w-[12rem] flex-1">
          <Label>Search</Label>
          <input className={input} name="q" defaultValue={q} placeholder="Name or phone" />
        </label>
        <label>
          <Label>Segment</Label>
          <select className={input} name="segment" defaultValue={segment ?? ''}>
            <option value="">All</option>
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Label>Sort by</Label>
          <select className={input} name="sort" defaultValue={sort}>
            {(Object.keys(SORT_LABEL) as CustomerSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={btnGhost}>
          Apply
        </button>
      </form>
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title={q || segment ? 'No clients match these filters.' : 'No clients yet. They appear with the first order.'} />
      ) : (
        <div className={`${card} overflow-auto !p-0 md:max-h-[calc(100dvh-16rem)]`}>
          <table className={`${table} min-w-[840px]`}>
            <thead>
              <tr>
                <th className={`${sth} sm:pl-5`}>Client</th>
                <th className={sth}>Region</th>
                <th className={sth}>Segment</th>
                <th className={`${sth} text-right`}>Orders</th>
                <th className={`${sth} text-right`}>Spent</th>
                <th className={`${sth} sm:pr-5`}>Last order</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-neutral-50">
                  <td className={`${td} sm:pl-5`}>
                    <Link href={`/admin/clients/${c.id}`} className="font-semibold text-neutral-900 underline-offset-2 hover:text-indigo-700 hover:underline">
                      {c.name}
                    </Link>
                    {c.blocked ? (
                      <span className="ml-2">
                        <Badge tone="red">Blocked</Badge>
                      </span>
                    ) : null}
                    {c.accountCreatedAt ? (
                      <span className="ml-2" title={`Telegram account since ${tashkentDay(c.accountCreatedAt)}`}>
                        <Badge tone="accent">Account</Badge>
                      </span>
                    ) : null}
                    <div className="text-xs text-neutral-500">{c.phone}</div>
                  </td>
                  <td className={`${td} text-neutral-700`}>{c.region ? (getRegion(c.region)?.name.en ?? c.region) : '-'}</td>
                  <td className={td}>
                    <Badge tone={SEGMENT_TONE[c.segment]}>{c.segment}</Badge>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{c.orders}</td>
                  <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{formatUzs(c.spentUzs, 'en')}</td>
                  <td className={`${td} whitespace-nowrap text-xs text-neutral-600 sm:pr-5`}>{c.lastOrderAt ? tashkentDay(c.lastOrderAt) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Pagination">
          {page > 1 ? (
            <Link href={`/admin/clients?${qs({ page: page - 1 })}`} className={btnGhost}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-600">
            Page {page} of {pages} ({total} clients)
          </span>
          {page < pages ? (
            <Link href={`/admin/clients?${qs({ page: page + 1 })}`} className={btnGhost}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  )
}
