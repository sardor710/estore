import { prisma } from '@/lib/db'
import { getRegion } from '@/lib/regions'
import { t } from '@/lib/localized'
import { tashkentDay } from '@/lib/analytics/visitor'
import type { DashboardRange, Kpi } from '@/lib/admin/dashboard'

/** Daily unique visitors of one Tashkent day. `unknown` = recorded before the split existed, or only a daily total is left. */
export type TrafficDay = { day: string; signedIn: number; guests: number; unknown: number }

export type TrafficData = {
  /** First Tashkent day that has a view with the guest / signed-in flag; null when there is none yet. */
  splitSince: string | null
  /** First Tashkent day that still has raw page views (hours, weekdays and regions need them); null when there are none. */
  rawSince: string | null
  /** False when no day of the range can carry the split (nothing tracked yet, or the range ends before it started). */
  splitInRange: boolean
  /** True only when the whole previous period was tracked, i.e. Signed-in / Guests may be compared with it. */
  prevComparable: boolean
  kpis: { signedIn: Kpi; guests: Kpi; newAccounts: Kpi }
  /** One entry per day of the range, ascending. */
  perDay: TrafficDay[]
  /** 24 page-view counts, index = Tashkent hour. */
  hours: number[]
  /** 7 averages (page views per calendar day of that weekday, one decimal), index 0 = Monday. */
  weekdays: number[]
  /** Index of the largest value; the earliest wins a tie; null when everything is zero. */
  peakHour: number | null
  peakWeekday: number | null
  /** Signed-in daily visitors by profile region; `code: ''` = no usable region on the profile. */
  regions: { code: string; name: string; visitors: number }[]
  /** Latest website sign-ins, one row per customer, newest first; not limited by the range. */
  recentSignIns: { id: number; name: string; region: string; lastLoginAt: Date; lastSeenAt: Date | null }[]
}

const RECENT_SIGN_INS = 20
const NO_REGION = 'Not set'
const regionName = (code: string | null): string => {
  if (!code) return NO_REGION
  const r = getRegion(code)
  return r ? t(r.name, 'en') : code
}

const round1 = (n: number) => Math.round(n * 10) / 10
/** 0 = Monday ... 6 = Sunday, for a YYYY-MM-DD day. */
const weekdayOf = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7
const peak = (values: number[]): number | null => {
  let best: number | null = null
  values.forEach((v, i) => {
    if (v > 0 && (best === null || v > values[best])) best = i
  })
  return best
}

type DayRow = { day: string; total: bigint; signedIn: bigint; known: bigint; views: bigint }

/**
 * Everything the dashboard's Traffic section shows. All grouping happens in SQLite; nothing here loads raw rows.
 * Visitors are "daily unique visitors" (the visitor hash changes every day), like the Visitors KPI.
 */
export async function getTraffic(range: DashboardRange): Promise<TrafficData> {
  const { days } = range
  const first = days[0]
  const last = days[days.length - 1]
  const prevFirst = tashkentDay(range.prevFrom)
  const prevLast = tashkentDay(new Date(range.prevTo.getTime() - 1))

  const [dayRows, hourRows, regionRows, rolled, rawMin, splitMin, newAccounts, prevNewAccounts, recent] = await Promise.all([
    // Per day: all visitors, those with at least one signed-in view, and those with at least one view that carries the flag.
    prisma.$queryRaw<DayRow[]>`
      SELECT day,
             COUNT(DISTINCT visitorHash) AS total,
             COUNT(DISTINCT CASE WHEN signedIn = 1 THEN visitorHash END) AS signedIn,
             COUNT(DISTINCT CASE WHEN signedIn IS NOT NULL THEN visitorHash END) AS known,
             COUNT(*) AS views
      FROM PageView
      WHERE day >= ${prevFirst} AND day <= ${last}
      GROUP BY day`,
    // createdAt is ISO text in UTC; Tashkent is UTC+5 without DST.
    prisma.$queryRaw<{ h: bigint | number | null; n: bigint }[]>`
      SELECT CAST(strftime('%H', createdAt, '+5 hours') AS INTEGER) AS h, COUNT(*) AS n
      FROM PageView
      WHERE day >= ${first} AND day <= ${last}
      GROUP BY h`,
    prisma.$queryRaw<{ region: string | null; n: bigint }[]>`
      SELECT region, COUNT(DISTINCT day || '|' || visitorHash) AS n
      FROM PageView
      WHERE day >= ${first} AND day <= ${last} AND signedIn = 1
      GROUP BY region`,
    prisma.dailyTraffic.findMany({ where: { day: { gte: prevFirst, lte: last } }, select: { day: true, visitors: true } }),
    prisma.pageView.aggregate({ _min: { day: true } }),
    prisma.pageView.aggregate({ _min: { day: true }, where: { signedIn: { not: null } } }),
    prisma.customer.count({ where: { accountCreatedAt: { gte: range.from, lt: range.to } } }),
    prisma.customer.count({ where: { accountCreatedAt: { gte: range.prevFrom, lt: range.prevTo } } }),
    prisma.customer.findMany({
      where: { lastLoginAt: { not: null }, accountCreatedAt: { not: null } },
      orderBy: [{ lastLoginAt: 'desc' }, { id: 'desc' }],
      take: RECENT_SIGN_INS,
      select: { id: true, name: true, region: true, lastLoginAt: true, lastSeenAt: true },
    }),
  ])

  const rawSince = rawMin._min.day ?? null
  const raw = new Map(dayRows.map((r) => [r.day, { total: Number(r.total), signedIn: Number(r.signedIn), known: Number(r.known), views: Number(r.views) }]))
  const rolledVisitors = new Map(rolled.map((r) => [r.day, r.visitors]))

  /** Raw rows where they exist; a pruned day keeps its rolled-up visitors, as unknown. */
  const dayOf = (day: string): TrafficDay => {
    const r = raw.get(day)
    if (r) return { day, signedIn: r.signedIn, guests: r.known - r.signedIn, unknown: r.total - r.known }
    return { day, signedIn: 0, guests: 0, unknown: rolledVisitors.get(day) ?? 0 }
  }
  const perDay = days.map(dayOf)

  let prevSignedIn = 0
  let prevGuests = 0
  for (const [day, r] of raw) {
    if (day < prevFirst || day > prevLast) continue
    prevSignedIn += r.signedIn
    prevGuests += r.known - r.signedIn
  }

  const hours: number[] = Array(24).fill(0)
  for (const r of hourRows) {
    const h = Number(r.h)
    if (r.h !== null && h >= 0 && h < 24) hours[h] += Number(r.n)
  }

  // Average per calendar day of each weekday. Days before the first raw row were not tracked and must not dilute it.
  const weekdayViews: number[] = Array(7).fill(0)
  const weekdayDays: number[] = Array(7).fill(0)
  for (const day of days) {
    if (!rawSince || day < rawSince) continue
    const w = weekdayOf(day)
    weekdayDays[w] += 1
    weekdayViews[w] += raw.get(day)?.views ?? 0
  }
  const weekdays = weekdayViews.map((v, w) => (weekdayDays[w] ? round1(v / weekdayDays[w]) : 0))

  const byRegion = new Map<string, number>()
  for (const r of regionRows) {
    const code = r.region && getRegion(r.region) ? r.region : ''
    byRegion.set(code, (byRegion.get(code) ?? 0) + Number(r.n))
  }
  const regions = [...byRegion]
    .map(([code, visitors]) => ({ code, name: regionName(code), visitors }))
    // biggest first; "Not set" always last among equals so a real region is never hidden behind it
    .sort((a, b) => b.visitors - a.visitors || Number(a.code === '') - Number(b.code === '') || a.name.localeCompare(b.name))

  const splitSince = splitMin._min.day ?? null
  return {
    splitSince,
    rawSince,
    splitInRange: splitSince !== null && splitSince <= last,
    prevComparable: splitSince !== null && splitSince <= prevFirst,
    kpis: {
      signedIn: { value: perDay.reduce((s, d) => s + d.signedIn, 0), prev: prevSignedIn },
      guests: { value: perDay.reduce((s, d) => s + d.guests, 0), prev: prevGuests },
      newAccounts: { value: newAccounts, prev: prevNewAccounts },
    },
    perDay,
    hours,
    weekdays,
    peakHour: peak(hours),
    peakWeekday: peak(weekdays),
    regions,
    recentSignIns: recent.map((c) => ({ id: c.id, name: c.name, region: regionName(c.region), lastLoginAt: c.lastLoginAt!, lastSeenAt: c.lastSeenAt })),
  }
}
