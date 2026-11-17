import Link from 'next/link'
import { requirePermission } from '@/lib/admin/session'
import { CUSTOMERS_PAGE_SIZE, SEGMENTS, isCustomerSort, isSegment, listCustomers, type CustomerSort, type Segment } from '@/lib/customers'
import { formatUzs } from '@/lib/money'
import { Badge, PageTitle, btn, btnGhost, card, input } from '@/components/admin/ui'

export const metadata = { title: 'Clients' }

type Search = { q?: string; segment?: string; sort?: string; page?: string }

const SEGMENT_TONE: Record<Segment, 'blue' | 'neutral' | 'amber' | 'red'> = { NEW: 'blue', RETURNING: 'neutral', VIP: 'amber', INACTIVE: 'red' }
const SORT_LABEL: Record<CustomerSort, string> = { last: 'Last order', spent: 'Total spent', orders: 'Orders', name: 'Name' }
const fieldLabel = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500'

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
      <PageTitle
        actions={
          <a href={`/api/admin/clients/export${exportQs ? `?${exportQs}` : ''}`} className={btnGhost}>
            Export CSV
          </a>
        }
      >
        Clients
      </PageTitle>

      <form method="get" className={`${card} mb-4 flex flex-wrap items-end gap-3`}>
        <label className="min-w-[12rem] flex-1">
          <span className={fieldLabel}>Search</span>
          <input className={input} name="q" defaultValue={q} placeholder="Name or phone" />
        </label>
        <label>
          <span className={fieldLabel}>Segment</span>
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
          <span className={fieldLabel}>Sort by</span>
          <select className={input} name="sort" defaultValue={sort}>
            {(Object.keys(SORT_LABEL) as CustomerSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={btn}>
          Apply
        </button>
      </form>

      {rows.length === 0 ? (
        <div className={`${card} text-sm text-neutral-500`}>
          {q || segment ? 'No clients match these filters.' : 'No clients yet. They appear with the first order.'}
        </div>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr>
                <th className="pb-2">Client</th>
                <th className="pb-2">Segment</th>
                <th className="pb-2 text-right">Orders</th>
                <th className="pb-2 text-right">Spent</th>
                <th className="pb-2 pl-3">Last order</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-neutral-100 align-top">
                  <td className="py-2 pr-3">
                    <Link href={`/admin/clients/${c.id}`} className="font-semibold text-neutral-900 underline-offset-2 hover:underline">
                      {c.name}
                    </Link>
                    {c.blocked ? (
                      <span className="ml-2">
                        <Badge tone="red">Blocked</Badge>
                      </span>
                    ) : null}
                    <div className="text-xs text-neutral-500">{c.phone}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={SEGMENT_TONE[c.segment]}>{c.segment}</Badge>
                  </td>
                  <td className="py-2 pr-3 text-right">{c.orders}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right">{formatUzs(c.spentUzs, 'en')}</td>
                  <td className="whitespace-nowrap py-2 pl-3 text-xs text-neutral-600">{c.lastOrderAt ? c.lastOrderAt.toISOString().slice(0, 10) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
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
