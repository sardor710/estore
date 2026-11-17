import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import { getDashboard, resolveRange } from '@/lib/admin/dashboard'
import { rollupAndPrune } from '@/lib/analytics/rollup'

const NOW = new Date('2026-12-05T08:00:00Z') // 2026-12-05 in Tashkent

let seq = 0
async function seedOrder(status: string, totalUzs: number, createdAt: string, region = 'tashkent-city') {
  return prisma.order.create({
    data: {
      number: ++seq, status, name: 'A', phone: '+998901234567', region, address: 'x', locale: 'en', totalUzs,
      createdAt: new Date(createdAt),
      lines: { create: [{ variantId: 1, sku: 'S1', productTitle: 'Phone', variantName: 'Black', priceUzs: totalUzs, qty: 1 }] },
    },
  })
}
const view = (day: string, hash: string, path = '/uz', ref: string | null = null) =>
  prisma.pageView.create({ data: { day, path, locale: 'uz', referrerHost: ref, device: 'mobile', visitorHash: hash } })

describe('resolveRange', () => {
  it('7d ends today (Tashkent) and has 7 days; prev is the 7 before', () => {
    const r = resolveRange('7d', undefined, undefined, NOW)
    expect(r.days).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05'])
    expect(r.from.toISOString()).toBe('2026-11-28T19:00:00.000Z')
    expect(r.to.toISOString()).toBe('2026-12-05T19:00:00.000Z')
    expect(r.prevTo.toISOString()).toBe(r.from.toISOString())
    expect(r.prevFrom.toISOString()).toBe('2026-11-21T19:00:00.000Z')
  })
  it('custom is clamped, swapped when reversed, and falls back on garbage', () => {
    expect(resolveRange('custom', '2026-12-03', '2026-12-01', NOW).days).toHaveLength(3)
    expect(resolveRange('custom', 'nope', undefined, NOW).days).toHaveLength(30)
    expect(resolveRange('custom', '2020-01-01', '2026-12-01', NOW).days.length).toBeLessThanOrEqual(366)
  })
})

describe('getDashboard', () => {
  it('computes KPIs for a single Tashkent day', async () => {
    await seedOrder('CONFIRMED', 1_000_000, '2026-12-01T20:30:00Z') // 2026-12-02 01:30 Tashkent
    await seedOrder('DELIVERED', 500_000, '2026-12-02T10:00:00Z')
    await seedOrder('CANCELLED', 900_000, '2026-12-02T11:00:00Z')
    await seedOrder('NEW', 200_000, '2026-12-02T12:00:00Z')
    for (const h of ['a', 'b', 'c', 'd']) await view('2026-12-02', h)
    await view('2026-12-02', 'a', '/uz/p/x', 'google.com') // 5th view, same visitor

    const d = await getDashboard(resolveRange('custom', '2026-12-02', '2026-12-02', NOW), NOW)
    expect(d.kpis.revenueUzs.value).toBe(1_500_000)
    expect(d.kpis.orders.value).toBe(2)
    expect(d.kpis.pendingOrders.value).toBe(1)
    expect(d.kpis.aovUzs.value).toBe(750_000)
    expect(d.kpis.visitors.value).toBe(4)
    expect(d.kpis.pageViews.value).toBe(5)
    expect(d.kpis.conversionPct.value).toBe(50)
    expect(d.kpis.revenueUzs.prev).toBe(0)
    expect(d.series).toEqual([{ day: '2026-12-02', revenueUzs: 1_500_000, orders: 2, visitors: 4 }])
    expect(d.ordersByStatus).toMatchObject({ NEW: 1, CONFIRMED: 1, DELIVERED: 1, CANCELLED: 1 })
    expect(d.salesByRegion[0]).toMatchObject({ code: 'tashkent-city', name: 'Tashkent city', revenueUzs: 1_500_000, orders: 2 })
    expect(d.topProductsByUnits[0]).toMatchObject({ title: 'Phone', units: 2, revenueUzs: 1_500_000 })
    expect(d.sources.find((s) => s.label === 'Direct')?.value).toBe(4)
    expect(d.sources.find((s) => s.label === 'google.com')?.value).toBe(1)
    expect(d.devices).toEqual([{ label: 'mobile', value: 5 }])
    expect(d.topPages[0]).toEqual({ label: '/uz', value: 4 })
  })
  it('is empty and safe with no data (no NaN, conversion 0)', async () => {
    const d = await getDashboard(resolveRange('7d', undefined, undefined, NOW), NOW)
    expect(d.kpis.aovUzs.value).toBe(0)
    expect(d.kpis.conversionPct.value).toBe(0)
    expect(d.series).toHaveLength(7)
    expect(d.topProductsByUnits).toEqual([])
    expect(d.topProductsByRevenue).toEqual([])
    expect(d.recentOrders).toEqual([])
  })
  it('top products by revenue is not cut from the by-units list', async () => {
    const mk = (title: string, units: number, price: number) =>
      prisma.order.create({
        data: {
          number: ++seq, status: 'DELIVERED', name: 'A', phone: '+998901234567', region: 'tashkent', address: 'x', locale: 'en', totalUzs: units * price,
          createdAt: new Date('2026-12-03T10:00:00Z'),
          lines: { create: [{ variantId: 1, sku: title, productTitle: title, variantName: 'v', priceUzs: price, qty: units }] },
        },
      })
    for (let i = 0; i < 11; i++) await mk(`cheap-${String(i).padStart(2, '0')}`, 100 - i, 1000) // 11 titles with many units
    await mk('premium', 1, 50_000_000) // 1 unit, highest revenue
    const d = await getDashboard(resolveRange('custom', '2026-12-03', '2026-12-03', NOW), NOW)
    expect(d.topProductsByUnits).toHaveLength(10)
    expect(d.topProductsByUnits.map((p) => p.title)).not.toContain('premium')
    expect(d.topProductsByRevenue[0].title).toBe('premium')
    expect(d.topProductsByRevenue).toHaveLength(10)
  })
  it('stock lists keep the emptiest variants when capped', async () => {
    const cat = await prisma.category.create({ data: { slug: 'c2', name: { en: 'C' } } })
    await prisma.setting.create({ data: { key: 'lowStockThreshold', value: '50' } })
    for (let i = 0; i < 25; i++) {
      await prisma.product.create({
        data: {
          slug: `s${i}`, categoryId: cat.id, status: 'PUBLISHED', title: { en: `s${i}` }, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [],
          inTheBox: [], faq: [], specs: [], images: ['/a.jpg'], reviewed: { uz: true, ru: true },
          variants: { create: [{ sku: `K${i}`, name: { en: 'v' }, priceUzs: 10, stock: 49 - i }] }, // stock 49..25
        },
      })
    }
    const d = await getDashboard(resolveRange('7d', undefined, undefined, NOW), NOW)
    expect(d.lowStock.total).toBe(25)
    expect(d.lowStock.items).toHaveLength(20)
    expect(d.lowStock.items[0].stock).toBe(25)
    expect(d.lowStock.items.at(-1)!.stock).toBe(44)
  })
  it('uses DailyTraffic for days whose raw rows were pruned', async () => {
    await prisma.dailyTraffic.create({ data: { day: '2026-12-03', views: 40, visitors: 12 } })
    const d = await getDashboard(resolveRange('custom', '2026-12-03', '2026-12-03', NOW), NOW)
    expect(d.kpis.visitors.value).toBe(12)
    expect(d.kpis.pageViews.value).toBe(40)
  })
  it('stock and catalog health', async () => {
    const cat = await prisma.category.create({ data: { slug: 'c', name: { en: 'Phones' } } })
    const mk = (slug: string, status: string, variants: { sku: string; priceUzs: number; stock: number }[], images: string[] = ['/a.jpg'], reviewed = { uz: true, ru: true }) =>
      prisma.product.create({
        data: {
          slug, categoryId: cat.id, status, title: { en: slug }, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [], inTheBox: [],
          faq: [], specs: [], images, reviewed, variants: { create: variants.map((v) => ({ ...v, name: { en: v.sku } })) },
        },
      })
    await mk('low', 'PUBLISHED', [{ sku: 'L1', priceUzs: 10, stock: 2 }])
    await mk('out', 'PUBLISHED', [{ sku: 'O1', priceUzs: 10, stock: 0 }], [], { uz: false, ru: true })
    await mk('fine', 'PUBLISHED', [{ sku: 'F1', priceUzs: 10, stock: 50 }])
    await mk('draft', 'DRAFT', [{ sku: 'D1', priceUzs: 0, stock: 1 }])
    await mk('free', 'PUBLISHED', [{ sku: 'P1', priceUzs: 0, stock: 9 }])
    const d = await getDashboard(resolveRange('7d', undefined, undefined, NOW), NOW)
    expect(d.lowStock.items.map((v) => v.sku)).toEqual(['L1'])
    expect(d.outOfStock.items.map((v) => v.sku)).toEqual(['O1'])
    expect(d.catalogHealth).toEqual({ drafts: 1, noPrice: 1, noImages: 1, unreviewedTranslations: 1 })
  })
})

describe('rollupAndPrune', () => {
  it('is incremental: rolled days are left alone, yesterday is refreshed, salts of finished days are deleted', async () => {
    await view('2026-12-03', 'a')
    await view('2026-12-04', 'a')
    await rollupAndPrune(NOW)
    await view('2026-12-03', 'b') // late row on an already rolled day: not rescanned
    await view('2026-12-04', 'b') // yesterday: refreshed
    await rollupAndPrune(NOW)
    expect(await prisma.dailyTraffic.findUnique({ where: { day: '2026-12-03' } })).toEqual({ day: '2026-12-03', views: 1, visitors: 1 })
    expect(await prisma.dailyTraffic.findUnique({ where: { day: '2026-12-04' } })).toEqual({ day: '2026-12-04', views: 2, visitors: 2 })
  })
  it('deletes visitor salts of finished days only', async () => {
    await prisma.setting.createMany({
      data: [
        { key: 'visitorSalt:2026-12-04', value: 'x' },
        { key: 'visitorSalt:2026-12-05', value: 'y' },
        { key: 'minOrderUzs', value: '5' },
      ],
    })
    await rollupAndPrune(NOW)
    expect((await prisma.setting.findMany({ orderBy: { key: 'asc' } })).map((r) => r.key)).toEqual(['minOrderUzs', 'visitorSalt:2026-12-05'])
  })
  it('moves finished days into DailyTraffic, keeps today raw, deletes raw rows older than 180 days', async () => {
    await view('2026-12-03', 'a')
    await view('2026-12-03', 'a')
    await view('2026-12-03', 'b')
    await view('2026-12-05', 'z') // today: untouched
    await view('2026-04-01', 'old') // more than 180 days before 2026-12-05
    await rollupAndPrune(NOW)
    expect(await prisma.dailyTraffic.findUnique({ where: { day: '2026-12-03' } })).toEqual({ day: '2026-12-03', views: 3, visitors: 2 })
    expect(await prisma.dailyTraffic.findUnique({ where: { day: '2026-12-05' } })).toBeNull()
    expect(await prisma.dailyTraffic.findUnique({ where: { day: '2026-04-01' } })).toEqual({ day: '2026-04-01', views: 1, visitors: 1 })
    expect(await prisma.pageView.count({ where: { day: '2026-04-01' } })).toBe(0)
    expect(await prisma.pageView.count({ where: { day: '2026-12-03' } })).toBe(3)
    await rollupAndPrune(NOW) // idempotent
    expect(await prisma.dailyTraffic.count()).toBe(2)
  })
})
