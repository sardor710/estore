import { prisma } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { getRegion } from '@/lib/regions'
import { t, type L10n } from '@/lib/localized'
import { tashkentDay } from '@/lib/analytics/visitor'
import { listPromotions } from '@/lib/admin/promotions'

export type RangeKey = 'today' | '7d' | '30d' | '90d' | 'custom'
export const RANGE_KEYS: readonly RangeKey[] = ['today', '7d', '30d', '90d', 'custom']
export const isRangeKey = (v: unknown): v is RangeKey => typeof v === 'string' && (RANGE_KEYS as readonly string[]).includes(v)

export type DashboardRange = {
  /** Start of the first day (Tashkent midnight), inclusive. */
  from: Date
  /** Start of the day after the last one, exclusive. */
  to: Date
  /** The equally long period right before `from`. */
  prevFrom: Date
  prevTo: Date
  /** Tashkent calendar days in the range, ascending (YYYY-MM-DD). */
  days: string[]
}

const DAY_MS = 86_400_000
const TASHKENT_OFFSET_MS = 5 * 3_600_000
const MAX_DAYS = 366
const PRESET_DAYS: Record<string, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90 }
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

const dayToMs = (day: string) => Date.parse(`${day}T00:00:00Z`)
const msToDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const validDay = (s: string | undefined): s is string => !!s && DAY_RE.test(s) && msToDay(dayToMs(s)) === s
/** Tashkent midnight of a day as an instant. */
const startOf = (day: string) => new Date(dayToMs(day) - TASHKENT_OFFSET_MS)

export function resolveRange(key: RangeKey, from: string | undefined, to: string | undefined, now: Date): DashboardRange {
  const today = tashkentDay(now)
  let last = today
  let count = PRESET_DAYS[key] ?? 30
  if (key === 'custom' && validDay(from)) {
    let a = from
    let b = validDay(to) ? to : today
    if (a > b) [a, b] = [b, a]
    if (b > today) b = today
    if (a > b) a = b
    last = b
    count = Math.min(MAX_DAYS, (dayToMs(b) - dayToMs(a)) / DAY_MS + 1)
  }
  const firstMs = dayToMs(last) - (count - 1) * DAY_MS
  const days = Array.from({ length: count }, (_, i) => msToDay(firstMs + i * DAY_MS))
  const start = startOf(days[0])
  return {
    from: start,
    to: new Date(startOf(last).getTime() + DAY_MS),
    prevFrom: new Date(start.getTime() - count * DAY_MS),
    prevTo: start,
    days,
  }
}

export type Kpi = { value: number; prev: number }
export type RankRow = { label: string; value: number }

export type DashboardData = {
  kpis: {
    revenueUzs: Kpi
    orders: Kpi
    pendingOrders: Kpi
    aovUzs: Kpi
    /** Sum over the days of each day's distinct visitors ("daily unique visitors"), not unique people across the range. */
    visitors: Kpi
    pageViews: Kpi
    /** Revenue orders per visitor, percent with one decimal; 0 when there are no visitors. */
    conversionPct: Kpi
  }
  series: { day: string; revenueUzs: number; orders: number; visitors: number }[]
  ordersByStatus: Record<'NEW' | 'CONFIRMED' | 'SHIPPING' | 'DELIVERED' | 'CANCELLED', number>
  recentOrders: { id: number; number: number; status: string; name: string; totalUzs: number; createdAt: Date }[]
  /** Both lists are cut from the full set of sold titles, so the leader of one ranking is never lost to the other. */
  topProductsByUnits: { title: string; units: number; revenueUzs: number }[]
  topProductsByRevenue: { title: string; units: number; revenueUzs: number }[]
  topCategories: { name: string; units: number; revenueUzs: number }[]
  salesByRegion: { code: string; name: string; orders: number; revenueUzs: number }[]
  topPages: RankRow[]
  sources: RankRow[]
  devices: RankRow[]
  lowStock: StockList
  outOfStock: StockList
  catalogHealth: { drafts: number; noPrice: number; noImages: number; unreviewedTranslations: number }
  promos: { active: { id: number; name: string; endsAt: Date | null }[]; upcoming: { id: number; name: string; startsAt: Date | null }[] }
}
export type StockList = { total: number; items: { productId: number; title: string; variant: string; sku: string; stock: number }[] }

const STOCK_LIST_CAP = 20
const REVENUE = ['CONFIRMED', 'SHIPPING', 'DELIVERED'] // SHIPPING = out for delivery (still a sale)
const rank = <K extends string>(m: Map<K, number>, n: number): RankRow[] =>
  [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([label, value]) => ({ label, value }))

type TrafficDay = { views: number; visitors: number }

/** Per-day traffic: raw rows where they exist (fresh, today included), DailyTraffic for days whose raw rows were pruned. */
async function trafficByDay(first: string, last: string): Promise<Map<string, TrafficDay>> {
  const [daily, raw] = await Promise.all([
    prisma.dailyTraffic.findMany({ where: { day: { gte: first, lte: last } } }),
    prisma.pageView.groupBy({ by: ['day', 'visitorHash'], where: { day: { gte: first, lte: last } }, _count: { _all: true } }),
  ])
  const out = new Map<string, TrafficDay>(daily.map((d) => [d.day, { views: d.views, visitors: d.visitors }]))
  const fromRaw = new Map<string, TrafficDay>()
  for (const r of raw) {
    const d = fromRaw.get(r.day) ?? { views: 0, visitors: 0 }
    d.views += r._count._all
    d.visitors += 1
    fromRaw.set(r.day, d)
  }
  for (const [day, d] of fromRaw) out.set(day, d)
  return out
}

type OrderLite = { createdAt: Date; status: string; totalUzs: number }
function period(orders: OrderLite[], traffic: Map<string, TrafficDay>, days: string[]) {
  const paid = orders.filter((o) => REVENUE.includes(o.status))
  const revenueUzs = paid.reduce((s, o) => s + o.totalUzs, 0)
  let visitors = 0
  let pageViews = 0
  for (const d of days) {
    visitors += traffic.get(d)?.visitors ?? 0
    pageViews += traffic.get(d)?.views ?? 0
  }
  return {
    revenueUzs,
    orders: paid.length,
    pendingOrders: orders.filter((o) => o.status === 'NEW').length,
    aovUzs: paid.length ? Math.round(revenueUzs / paid.length) : 0,
    visitors,
    pageViews,
    conversionPct: visitors ? Math.round((paid.length / visitors) * 1000) / 10 : 0,
  }
}

export async function getDashboard(range: DashboardRange, now: Date = new Date()): Promise<DashboardData> {
  const { days } = range
  const prevDays = Array.from({ length: days.length }, (_, i) => msToDay(dayToMs(days[0]) - (days.length - i) * DAY_MS))
  const settings = await getSettings()

  const [orders, prevOrders, traffic, prevTraffic] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: range.from, lt: range.to } },
      select: { id: true, createdAt: true, status: true, totalUzs: true, region: true },
    }),
    prisma.order.findMany({ where: { createdAt: { gte: range.prevFrom, lt: range.prevTo } }, select: { createdAt: true, status: true, totalUzs: true } }),
    trafficByDay(days[0], days[days.length - 1]),
    trafficByDay(prevDays[0], prevDays[prevDays.length - 1]),
  ])
  const cur = period(orders, traffic, days)
  const prev = period(prevOrders, prevTraffic, prevDays)
  const kpi = (k: keyof typeof cur): Kpi => ({ value: cur[k], prev: prev[k] })

  const perDay = new Map(days.map((d) => [d, { day: d, revenueUzs: 0, orders: 0, visitors: traffic.get(d)?.visitors ?? 0 }]))
  const paidOrders = orders.filter((o) => REVENUE.includes(o.status))
  for (const o of paidOrders) {
    const row = perDay.get(tashkentDay(o.createdAt))
    if (row) {
      row.revenueUzs += o.totalUzs
      row.orders += 1
    }
  }

  const ordersByStatus = { NEW: 0, CONFIRMED: 0, SHIPPING: 0, DELIVERED: 0, CANCELLED: 0 }
  for (const o of orders) if (o.status in ordersByStatus) ordersByStatus[o.status as keyof typeof ordersByStatus] += 1

  const regions = new Map<string, { orders: number; revenueUzs: number }>()
  for (const o of paidOrders) {
    const r = regions.get(o.region) ?? { orders: 0, revenueUzs: 0 }
    r.orders += 1
    r.revenueUzs += o.totalUzs
    regions.set(o.region, r)
  }

  const viewWhere = { day: { gte: days[0], lte: days[days.length - 1] } }
  const [recent, lines, pageRows, sourceRows, deviceRows, published, drafts, promos] = await Promise.all([
    prisma.order.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
      select: { id: true, number: true, status: true, name: true, totalUzs: true, createdAt: true },
    }),
    paidOrders.length
      ? prisma.orderLine.findMany({
          where: { orderId: { in: paidOrders.map((o) => o.id) } },
          select: { productTitle: true, variantId: true, priceUzs: true, qty: true },
        })
      : [],
    prisma.pageView.groupBy({ by: ['path'], where: viewWhere, _count: { _all: true } }),
    prisma.pageView.groupBy({ by: ['referrerHost'], where: viewWhere, _count: { _all: true } }),
    prisma.pageView.groupBy({ by: ['device'], where: viewWhere, _count: { _all: true } }),
    prisma.product.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, title: true, images: true, reviewed: true, variants: { select: { sku: true, name: true, priceUzs: true, stock: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { id: 'asc' },
    }),
    prisma.product.count({ where: { status: 'DRAFT' } }),
    listPromotions(now),
  ])

  const byTitle = new Map<string, { units: number; revenueUzs: number }>()
  for (const l of lines) {
    const p = byTitle.get(l.productTitle) ?? { units: 0, revenueUzs: 0 }
    p.units += l.qty
    p.revenueUzs += l.priceUzs * l.qty
    byTitle.set(l.productTitle, p)
  }
  const topBy = (cmp: (a: { units: number; revenueUzs: number }, b: { units: number; revenueUzs: number }) => number) =>
    [...byTitle]
      .map(([title, v]) => ({ title, ...v }))
      .sort((a, b) => cmp(b, a) || a.title.localeCompare(b.title))
      .slice(0, 10)
  const topProductsByUnits = topBy((a, b) => a.units - b.units || a.revenueUzs - b.revenueUzs)
  const topProductsByRevenue = topBy((a, b) => a.revenueUzs - b.revenueUzs || a.units - b.units)

  // Category via the variant that was sold; variants deleted since then cannot be attributed.
  const variantIds = [...new Set(lines.map((l) => l.variantId))]
  const variantCat = new Map<number, string>()
  if (variantIds.length) {
    const vs = await prisma.variant.findMany({ where: { id: { in: variantIds } }, select: { id: true, product: { select: { category: { select: { name: true } } } } } })
    for (const v of vs) variantCat.set(v.id, t(v.product.category.name as L10n, 'en'))
  }
  const byCat = new Map<string, { units: number; revenueUzs: number }>()
  for (const l of lines) {
    const name = variantCat.get(l.variantId)
    if (!name) continue
    const c = byCat.get(name) ?? { units: 0, revenueUzs: 0 }
    c.units += l.qty
    c.revenueUzs += l.priceUzs * l.qty
    byCat.set(name, c)
  }

  const pages = new Map(pageRows.map((r) => [r.path, r._count._all]))
  const sources = new Map<string, number>()
  for (const r of sourceRows) sources.set(r.referrerHost ?? 'Direct', r._count._all)
  const devices = new Map(deviceRows.map((r) => [r.device, r._count._all]))

  const low: StockList = { total: 0, items: [] }
  const out: StockList = { total: 0, items: [] }
  let noPrice = 0
  let noImages = 0
  let unreviewed = 0
  for (const p of published) {
    const title = t(p.title as L10n, 'en')
    if (p.variants.length === 0 || p.variants.every((v) => v.priceUzs <= 0)) noPrice += 1
    if (!Array.isArray(p.images) || p.images.length === 0) noImages += 1
    const rev = (p.reviewed ?? {}) as Record<string, unknown>
    if (rev.uz !== true || rev.ru !== true) unreviewed += 1
    for (const v of p.variants) {
      const target = v.stock <= 0 ? out : v.stock <= settings.lowStockThreshold ? low : null
      if (!target) continue
      target.total += 1
      target.items.push({ productId: p.id, title, variant: t(v.name as L10n, 'en'), sku: v.sku, stock: v.stock })
    }
  }
  // Emptiest first, then cap: the most urgent variants must survive the cut.
  for (const list of [low, out]) {
    list.items.sort((a, b) => a.stock - b.stock || a.sku.localeCompare(b.sku))
    list.items.length = Math.min(list.items.length, STOCK_LIST_CAP)
  }

  return {
    kpis: {
      revenueUzs: kpi('revenueUzs'),
      orders: kpi('orders'),
      pendingOrders: kpi('pendingOrders'),
      aovUzs: kpi('aovUzs'),
      visitors: kpi('visitors'),
      pageViews: kpi('pageViews'),
      conversionPct: kpi('conversionPct'),
    },
    series: days.map((d) => perDay.get(d)!),
    ordersByStatus,
    recentOrders: recent,
    topProductsByUnits,
    topProductsByRevenue,
    topCategories: [...byCat].sort((a, b) => b[1].revenueUzs - a[1].revenueUzs).slice(0, 5).map(([name, v]) => ({ name, ...v })),
    salesByRegion: [...regions]
      .sort((a, b) => b[1].revenueUzs - a[1].revenueUzs)
      .map(([code, v]) => ({ code, name: getRegion(code) ? t(getRegion(code)!.name, 'en') : code, ...v })),
    topPages: rank(pages, 10),
    sources: rank(sources, 10),
    devices: rank(devices, 3),
    lowStock: low,
    outOfStock: out,
    catalogHealth: { drafts, noPrice, noImages, unreviewedTranslations: unreviewed },
    promos: {
      active: promos.filter((p) => p.state === 'active').map((p) => ({ id: p.id, name: p.name, endsAt: p.endsAt })),
      upcoming: promos.filter((p) => p.state === 'scheduled').map((p) => ({ id: p.id, name: p.name, startsAt: p.startsAt })),
    },
  }
}
