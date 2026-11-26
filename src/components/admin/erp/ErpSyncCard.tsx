import Link from 'next/link'
import type { ErpStatus } from '@/lib/erp/status'
import { Badge, card } from '../ui'
import ErpRetryButton from './ErpRetryButton'

const KIND: Record<string, string> = { DELIVER: 'Delivery', RETURN: 'Return', RECEIPT: 'Stock back' }

function ago(iso: string | null, now: Date): string {
  if (!iso) return 'never'
  const min = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000)
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`
}

/** Dashboard card: is the ERPNext sync healthy, and which order pushes need a human. */
export default function ErpSyncCard({ s, now }: { s: ErpStatus; now: Date }) {
  const stale = !s.lastReconcileAt || now.getTime() - new Date(s.lastReconcileAt).getTime() > 15 * 60_000
  const tone = s.failed.length || stale ? 'red' : s.pending ? 'blue' : 'green'
  const label = s.failed.length ? `${s.failed.length} failed` : stale ? 'not syncing' : s.pending ? `${s.pending} waiting` : 'in sync'
  const r = s.lastResult
  return (
    <section className={`${card} mb-4 p-4`} aria-labelledby="erp-sync-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="erp-sync-h" className="text-sm font-semibold text-neutral-900">
          ERP sync{' '}
          <a className="font-normal text-indigo-700 underline" href="https://erp2.zanko.uz/app/item?item_group=Zanko" target="_blank" rel="noreferrer">
            erp2.zanko.uz
          </a>
        </h2>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <p className="mt-1 text-xs text-neutral-600">
        Stock and prices come from ERPNext. Last full check: {ago(s.lastReconcileAt, now)}
        {r ? ` (${r.skus} SKUs, ${r.stockChanged} stock and ${r.priceChanged} price updates)` : ''}. Pushes waiting: {s.pending}.
        {s.unlinked ? ` New SKUs not in ERP yet: ${s.unlinked}.` : ''}
      </p>
      {r && (r.missingPrice.length || r.missingInErp.length) ? (
        <p className="mt-1 text-xs text-amber-800">
          {r.missingPrice.length ? `No price in ERP for: ${r.missingPrice.slice(0, 10).join(', ')}${r.missingPrice.length > 10 ? '…' : ''}. ` : ''}
          {r.missingInErp.length ? `Missing in ERP: ${r.missingInErp.slice(0, 10).join(', ')}${r.missingInErp.length > 10 ? '…' : ''}.` : ''}
        </p>
      ) : null}
      {s.failed.length ? (
        <ul className="mt-3 space-y-2">
          {s.failed.map((f) => (
            <li key={f.id} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {KIND[f.kind] ?? f.kind} for{' '}
                  <Link className="font-semibold underline" href={`/admin/orders/${f.orderId}`}>
                    order {f.ref}
                  </Link>{' '}
                  failed after {f.attempts} attempt{f.attempts === 1 ? '' : 's'}
                </span>
                <ErpRetryButton id={f.id} />
              </div>
              {f.lastError ? <div className="mt-1 break-words text-red-800">{f.lastError}</div> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
