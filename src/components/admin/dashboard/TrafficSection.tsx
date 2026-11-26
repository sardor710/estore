import Link from 'next/link'
import type { DashboardData, RankRow } from '@/lib/admin/dashboard'
import type { TrafficData } from '@/lib/admin/traffic'
import { tashkentDateTime } from '@/lib/analytics/visitor'
import { Notice, card } from '@/components/admin/ui'
import BarsChart from './BarsChart'
import { StatTile, fmtNum } from './KpiTiles'
import RankList from './RankList'
import SplitChart from './SplitChart'
import { SERIES_COLOR } from './series-colors'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const hh = (h: number) => String(h).padStart(2, '0')

/**
 * Who visited the shop in the chosen range: how many, guests vs signed-in customers, when (hours, weekdays),
 * where the signed-in ones are from, and who signed in last. Server component; the charts are client components.
 */
export default function TrafficSection({
  traffic,
  kpis,
  topPages,
  sources,
  devices,
  firstDay,
}: {
  traffic: TrafficData
  kpis: Pick<DashboardData['kpis'], 'visitors' | 'pageViews'>
  topPages: RankRow[]
  sources: RankRow[]
  devices: RankRow[]
  /** First Tashkent day of the range (YYYY-MM-DD). */
  firstDay: string
}) {
  const { signedIn, guests, newAccounts } = traffic.kpis
  const known = signedIn.value + guests.value
  const share = known ? `${Math.round((signedIn.value / known) * 1000) / 10}% of known visitors` : undefined
  const { peakHour, peakWeekday } = traffic

  return (
    <section className="mb-6" aria-labelledby="traffic-heading">
      <h2 id="traffic-heading" className="text-base font-semibold text-neutral-900">
        Traffic
      </h2>
      <p className="mb-3 text-sm text-neutral-500">Who visited the shop. Visitors are daily unique visitors; a signed-in visitor is one who was signed in for at least one page that day.</p>

      {traffic.splitSince === null ? (
        <div className="mb-3">
          <Notice kind="info">Guest and signed-in counts start with the first visit recorded after this update.</Notice>
        </div>
      ) : traffic.splitSince > firstDay ? (
        <div className="mb-3">
          <Notice kind="info">The guest / signed-in split starts on {traffic.splitSince}. Earlier days are shown as Unknown.</Notice>
        </div>
      ) : null}

      <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-5">
        <StatTile label="Visitors" value={fmtNum(kpis.visitors.value)} hint="Daily unique visitors, summed over the days" kpi={kpis.visitors} />
        <StatTile label="Page views" value={fmtNum(kpis.pageViews.value)} kpi={kpis.pageViews} />
        {/* No number for a range the split cannot cover, and no "vs previous" against days that were not tracked. */}
        <StatTile
          label="Signed-in"
          value={traffic.splitInRange ? fmtNum(signedIn.value) : '—'}
          hint="Daily visitors who were signed in to a customer account"
          sub={traffic.splitInRange ? (share ?? undefined) : 'not recorded for these days'}
          kpi={traffic.splitInRange && traffic.prevComparable ? signedIn : undefined}
        />
        <StatTile
          label="Guests"
          value={traffic.splitInRange ? fmtNum(guests.value) : '—'}
          hint="Daily visitors who were not signed in"
          sub={traffic.splitInRange ? (traffic.prevComparable ? undefined : 'no earlier period to compare') : 'not recorded for these days'}
          kpi={traffic.splitInRange && traffic.prevComparable ? guests : undefined}
        />
        <StatTile label="New accounts" value={fmtNum(newAccounts.value)} hint="Customer accounts created in this period" kpi={newAccounts} />
      </dl>

      <div className={`${card} mb-4`}>
        <SplitChart data={traffic.perDay} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={card}>
          <BarsChart
            title="Busiest hours"
            subtitle="Page views by hour of day, Tashkent time"
            color={SERIES_COLOR.visitors}
            data={traffic.hours.map((value, h) => ({ label: hh(h), value }))}
            note={peakHour === null ? undefined : `Peak: ${hh(peakHour)}:00–${hh(peakHour + 1)}:00`}
            categoryLabel="Hour"
            valueLabel="Page views"
          />
        </div>
        <div className={card}>
          <BarsChart
            title="Busiest weekdays"
            subtitle="Average page views per day"
            color={SERIES_COLOR.visitors}
            data={traffic.weekdays.map((value, w) => ({ label: WEEKDAYS[w].slice(0, 3), value }))}
            note={peakWeekday === null ? undefined : `Peak: ${WEEKDAYS[peakWeekday]}`}
            categoryLabel="Weekday"
            valueLabel="Avg page views"
          />
        </div>
      </div>
      {traffic.rawSince !== null && traffic.rawSince > firstDay ? (
        <p className="-mt-2 mb-4 text-xs text-neutral-500">Hours, weekdays and regions are available from {traffic.rawSince}; older days are kept as daily totals only.</p>
      ) : null}

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <RankList
          title="Signed-in visitors by region"
          items={traffic.regions.map((r) => ({ label: r.name, value: r.visitors }))}
          empty="No signed-in visits yet. Guests have no region."
        />
        <section className={card}>
          <h3 className="mb-3 text-sm font-semibold text-neutral-900">Recent sign-ins</h3>
          {traffic.recentSignIns.length === 0 ? (
            <p className="rounded-lg bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">No customer has signed in yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {traffic.recentSignIns.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <Link href={`/admin/clients/${c.id}`} className="block truncate font-semibold text-neutral-900 underline-offset-2 hover:text-indigo-700 hover:underline">
                      {c.name}
                    </Link>
                    <span className="block truncate text-xs text-neutral-500">{c.region}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block tabular-nums text-neutral-800">{tashkentDateTime(c.lastLoginAt)}</span>
                    {c.lastSeenAt ? <span className="block text-xs tabular-nums text-neutral-500">seen {tashkentDateTime(c.lastSeenAt)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <RankList title="Top pages" items={topPages} />
        <RankList title="Traffic sources" items={sources} />
        <RankList title="Devices" items={devices} />
      </div>
    </section>
  )
}
