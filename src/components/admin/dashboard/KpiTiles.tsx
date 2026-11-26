import type { DashboardData, Kpi } from '@/lib/admin/dashboard'

export const fmtNum = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

type Tile = { key: keyof DashboardData['kpis']; label: string; format: (n: number) => string; hint?: string }

// Sales lead the page. Visitors and Page views live in the Traffic section, next to the guest / signed-in split.
const TILES: Tile[] = [
  { key: 'revenueUzs', label: 'Revenue', format: (n) => `${fmtNum(n)} so'm`, hint: 'Confirmed and delivered orders' },
  { key: 'orders', label: 'Orders', format: fmtNum, hint: 'Confirmed and delivered' },
  { key: 'pendingOrders', label: 'Pending orders', format: fmtNum, hint: 'New, not yet confirmed' },
  { key: 'aovUzs', label: 'Average order', format: (n) => `${fmtNum(n)} so'm` },
  { key: 'conversionPct', label: 'Conversion', format: (n) => `${n}%`, hint: 'Orders per visitor' },
]

/** Change vs the previous period. Direction is spelled out (arrow + sign), never colour alone. */
export function Delta({ k }: { k: Kpi }) {
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

/** One headline number. `primary` is the large sales style; the default is the quieter secondary style. */
export function StatTile({
  label,
  value,
  hint,
  kpi,
  sub,
  primary = false,
}: {
  label: string
  value: string
  hint?: string
  /** Shows the change vs the previous period. */
  kpi?: Kpi
  /** A short second line, e.g. "15% of visitors". */
  sub?: string
  primary?: boolean
}) {
  return (
    <div className={primary ? 'rounded-xl border border-neutral-200 bg-white p-4 shadow-xs sm:p-5' : 'rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-xs'} title={hint}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd
        className={
          primary
            ? 'mt-1.5 break-words text-2xl font-semibold tracking-tight tabular-nums text-neutral-900 sm:text-[1.75rem] sm:leading-9'
            : 'mt-1 break-words text-lg font-semibold tabular-nums text-neutral-900'
        }
      >
        {value}
      </dd>
      {sub ? <dd className="mt-0.5 text-xs text-neutral-500">{sub}</dd> : null}
      {kpi ? (
        <dd className="mt-1">
          <Delta k={kpi} />
        </dd>
      ) : null}
    </div>
  )
}

const PRIMARY = 4 // the four sales tiles lead; Conversion follows in the quieter style

export default function KpiTiles({ kpis }: { kpis: DashboardData['kpis'] }) {
  const tile = (t: Tile, primary: boolean) => <StatTile key={t.key} label={t.label} value={t.format(kpis[t.key].value)} hint={t.hint} kpi={kpis[t.key]} primary={primary} />
  return (
    <div className="mb-6 space-y-3">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{TILES.slice(0, PRIMARY).map((t) => tile(t, true))}</dl>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{TILES.slice(PRIMARY).map((t) => tile(t, false))}</dl>
    </div>
  )
}
