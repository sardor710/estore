import Link from 'next/link'
import { redirect } from 'next/navigation'
import { can, homeFor } from '@/lib/permissions'
import { getStaff, requirePermission } from '@/lib/admin/session'
import { getDashboard, isRangeKey, resolveRange, type RangeKey } from '@/lib/admin/dashboard'
import { getTraffic } from '@/lib/admin/traffic'
import { rollupAndPrune } from '@/lib/analytics/rollup'
import { tashkentDay } from '@/lib/analytics/visitor'
import { Badge, Notice, PageHeader, card } from '@/components/admin/ui'
import KpiTiles, { fmtNum } from '@/components/admin/dashboard/KpiTiles'
import RangePicker from '@/components/admin/dashboard/RangePicker'
import RankList from '@/components/admin/dashboard/RankList'
import TrafficSection from '@/components/admin/dashboard/TrafficSection'
import TrendChart from '@/components/admin/dashboard/TrendChart'
import { SERIES_COLOR } from '@/components/admin/dashboard/series-colors'
import ErpSyncCard from '@/components/admin/erp/ErpSyncCard'
import { getErpStatus } from '@/lib/erp/status'

export const metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

const STATUS_TONE: Record<string, 'blue' | 'green' | 'neutral' | 'red' | 'violet'> = { NEW: 'blue', CONFIRMED: 'green', SHIPPING: 'violet', DELIVERED: 'green', CANCELLED: 'red' }
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const som = (n: number) => `${fmtNum(n)} so'm`

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Staff without the dashboard (blog editors) go to their own section instead of a 403.
  const staff = await getStaff()
  if (staff && !can(staff.role, 'dashboard')) redirect(homeFor(staff.role))
  await requirePermission('dashboard')

  const sp = await searchParams
  const now = new Date()
  const rangeParam = one(sp.range)
  const key: RangeKey = isRangeKey(rangeParam) ? rangeParam : '7d'
  const range = resolveRange(key, one(sp.from), one(sp.to), now)

  try {
    await rollupAndPrune(now)
  } catch (e) {
    console.error('[dashboard] rollup failed', e) // housekeeping must never take the page down
  }
  const [d, traffic, erp] = await Promise.all([getDashboard(range, now), getTraffic(range), getErpStatus()])
  const first = range.days[0]
  const last = range.days[range.days.length - 1]
  const lowStockLabel = (v: { title: string; variant: string }) => (v.variant && v.variant !== v.title ? `${v.title} / ${v.variant}` : v.title)

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          <>
            <span className="font-medium text-neutral-800">{first === last ? first : `${first} to ${last}`}</span> (Tashkent time). Revenue counts confirmed and delivered orders; visitors are daily unique visitors.
          </>
        }
      />
      <RangePicker active={key === 'custom' ? 'custom' : key} from={first} to={last} maxDay={tashkentDay(now)} />

      {erp.enabled ? <ErpSyncCard s={erp} now={now} /> : null}

      {process.env.TRUST_PROXY !== '1' ? (
        <div className="mb-4">
          <Notice kind="warn">Visitor counts are approximate: set TRUST_PROXY=1 behind your reverse proxy. Without it visitors are told apart by browser only, so Visitors is undercounted, Conversion overstated, and guests on the same kind of browser as a signed-in customer are counted as signed-in.</Notice>
        </div>
      ) : null}
      <KpiTiles kpis={d.kpis} />

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={card}>
          <TrendChart title="Revenue" kind="bar" color={SERIES_COLOR.revenue} unit="so'm" data={d.series.map((s) => ({ day: s.day, value: s.revenueUzs }))} />
        </div>
        <div className={card}>
          <TrendChart title="Orders" kind="line" color={SERIES_COLOR.orders} data={d.series.map((s) => ({ day: s.day, value: s.orders }))} />
        </div>
      </div>

      <TrafficSection traffic={traffic} kpis={d.kpis} topPages={d.topPages} sources={d.sources} devices={d.devices} firstDay={first} />

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Orders by status</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {(Object.keys(d.ordersByStatus) as (keyof typeof d.ordersByStatus)[]).map((s) => (
              <li key={s} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5">
                <Badge tone={STATUS_TONE[s]}>{s}</Badge>
                <span className="font-semibold tabular-nums">{d.ordersByStatus[s]}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Latest orders</h2>
          {d.recentOrders.length === 0 ? (
            <p className="rounded-lg bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">No data yet</p>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {d.recentOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/admin/orders/${o.id}`} className="min-w-0 truncate font-semibold text-neutral-900 underline-offset-2 hover:text-indigo-700 hover:underline">
                    #{o.number} <span className="font-normal text-neutral-600">{o.name}</span>
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums">{som(o.totalUzs)}</span>
                    <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <RankList title="Top products (units)" items={d.topProductsByUnits.map((p) => ({ label: p.title, value: p.units, sub: som(p.revenueUzs) }))} />
        <RankList title="Top products (revenue)" items={d.topProductsByRevenue.map((p) => ({ label: p.title, value: p.revenueUzs, display: som(p.revenueUzs), sub: `${fmtNum(p.units)} units` }))} />
        <RankList title="Top categories (revenue)" items={d.topCategories.map((c) => ({ label: c.name, value: c.revenueUzs, display: som(c.revenueUzs), sub: `${fmtNum(c.units)} units` }))} />
        <RankList title="Sales by region" items={d.salesByRegion.map((r) => ({ label: r.name, value: r.revenueUzs, display: som(r.revenueUzs), sub: `${r.orders} orders` }))} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">
            Low stock <span className="font-normal text-neutral-500">({d.lowStock.total})</span>
          </h2>
          {d.lowStock.items.length === 0 ? (
            <p className="rounded-lg bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">Nothing running low.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {d.lowStock.items.map((v) => (
                <li key={v.sku} className="flex justify-between gap-3 py-2">
                  <Link href={`/admin/products/${v.productId}`} className="min-w-0 truncate text-neutral-800 underline-offset-2 hover:text-indigo-700 hover:underline">
                    {lowStockLabel(v)}
                  </Link>
                  <span className="shrink-0 font-semibold tabular-nums">{v.stock} left</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">
            Out of stock <span className="font-normal text-neutral-500">({d.outOfStock.total})</span>
          </h2>
          {d.outOfStock.items.length === 0 ? (
            <p className="rounded-lg bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">Everything is in stock.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {d.outOfStock.items.map((v) => (
                <li key={v.sku} className="flex justify-between gap-3 py-2">
                  <Link href={`/admin/products/${v.productId}`} className="min-w-0 truncate text-neutral-800 underline-offset-2 hover:text-indigo-700 hover:underline">
                    {lowStockLabel(v)}
                  </Link>
                  <span className="shrink-0 text-neutral-500">{v.sku}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Catalog health</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {[
              ['Draft products', d.catalogHealth.drafts],
              ['Published without price', d.catalogHealth.noPrice],
              ['Published without images', d.catalogHealth.noImages],
              ['Translations not reviewed', d.catalogHealth.unreviewedTranslations],
            ].map(([label, n]) => (
              <div key={label} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
                <dt className="text-xs text-neutral-500">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900">{n}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Promotions</h2>
          {d.promos.active.length === 0 && d.promos.upcoming.length === 0 ? (
            <p className="rounded-lg bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">No active or upcoming promotions.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {d.promos.active.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <Badge tone="green">active</Badge>
                  <Link href={`/admin/promotions/${p.id}`} className="text-neutral-800 underline-offset-2 hover:text-indigo-700 hover:underline">
                    {p.name}
                  </Link>
                </li>
              ))}
              {d.promos.upcoming.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <Badge tone="blue">upcoming</Badge>
                  <Link href={`/admin/promotions/${p.id}`} className="text-neutral-800 underline-offset-2 hover:text-indigo-700 hover:underline">
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
