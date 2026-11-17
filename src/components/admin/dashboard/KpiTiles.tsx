import type { DashboardData, Kpi } from '@/lib/admin/dashboard'
import { card } from '@/components/admin/ui'

export const fmtNum = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

type Tile = { key: keyof DashboardData['kpis']; label: string; format: (n: number) => string; hint?: string }

const TILES: Tile[] = [
  { key: 'revenueUzs', label: 'Revenue', format: (n) => `${fmtNum(n)} so'm`, hint: 'Confirmed and delivered orders' },
  { key: 'orders', label: 'Orders', format: fmtNum, hint: 'Confirmed and delivered' },
  { key: 'pendingOrders', label: 'Pending orders', format: fmtNum, hint: 'New, not yet confirmed' },
  { key: 'aovUzs', label: 'Average order', format: (n) => `${fmtNum(n)} so'm` },
  { key: 'visitors', label: 'Visitors', format: fmtNum, hint: 'Daily unique visitors, summed over the days' },
  { key: 'pageViews', label: 'Page views', format: fmtNum },
  { key: 'conversionPct', label: 'Conversion', format: (n) => `${n}%`, hint: 'Orders per visitor' },
]

/** Change vs the previous period. Direction is spelled out (arrow + sign), never colour alone. */
function Delta({ k }: { k: Kpi }) {
  if (k.prev === 0 && k.value === 0) return <span className="text-xs text-neutral-400">no change</span>
  if (k.prev === 0) return <span className="text-xs text-neutral-500">new this period</span>
  const pct = Math.round(((k.value - k.prev) / k.prev) * 1000) / 10
  if (pct === 0) return <span className="text-xs text-neutral-500">&rarr; 0% vs previous</span>
  const up = pct > 0
  return (
    <span className={`text-xs font-semibold ${up ? 'text-green-700' : 'text-red-700'}`}>
      {up ? '▲ +' : '▼ '}
      {pct}% <span className="font-normal text-neutral-500">vs previous</span>
    </span>
  )
}

export default function KpiTiles({ kpis }: { kpis: DashboardData['kpis'] }) {
  return (
    <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {TILES.map((tile) => {
        const k = kpis[tile.key]
        return (
          <div key={tile.key} className={`${card} !p-4`} title={tile.hint}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{tile.label}</dt>
            <dd className="mt-1 break-words text-xl font-bold tabular-nums text-neutral-900 sm:text-2xl">{tile.format(k.value)}</dd>
            <dd className="mt-1">
              <Delta k={k} />
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
