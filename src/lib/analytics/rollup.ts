import { prisma } from '@/lib/db'
import { SALT_PREFIX, forgetSaltsBefore, tashkentDay } from './visitor'

export const RAW_RETENTION_DAYS = 180
const DAY_MS = 86_400_000

/**
 * Folds raw page views of finished days into DailyTraffic (views + distinct visitors) and housekeeps:
 * - only days without a DailyTraffic row, plus yesterday (late beacons), are aggregated, so a dashboard load
 *   does not rescan 180 days; today stays raw;
 * - raw rows older than RAW_RETENTION_DAYS are deleted;
 * - visitor salts of finished days are deleted (hashes can no longer be recomputed).
 */
export async function rollupAndPrune(now: Date): Promise<void> {
  const today = tashkentDay(now)
  const yesterday = tashkentDay(new Date(now.getTime() - DAY_MS))
  const [rawDays, rolled] = await Promise.all([
    prisma.pageView.groupBy({ by: ['day'], where: { day: { lt: today } } }),
    prisma.dailyTraffic.findMany({ select: { day: true } }),
  ])
  const have = new Set(rolled.map((r) => r.day))
  const todo = rawDays.map((r) => r.day).filter((d) => !have.has(d) || d === yesterday)
  if (todo.length) {
    const perVisitor = await prisma.pageView.groupBy({ by: ['day', 'visitorHash'], where: { day: { in: todo } }, _count: { _all: true } })
    const totals = new Map<string, { views: number; visitors: number }>()
    for (const r of perVisitor) {
      const t = totals.get(r.day) ?? { views: 0, visitors: 0 }
      t.views += r._count._all
      t.visitors += 1
      totals.set(r.day, t)
    }
    const existing = new Map((await prisma.dailyTraffic.findMany({ where: { day: { in: todo } } })).map((r) => [r.day, r]))
    for (const [day, t] of totals) {
      const cur = existing.get(day)
      if (cur && cur.views === t.views && cur.visitors === t.visitors) continue
      await prisma.dailyTraffic.upsert({ where: { day }, update: t, create: { day, ...t } })
    }
  }
  const cutoff = tashkentDay(new Date(now.getTime() - RAW_RETENTION_DAYS * DAY_MS))
  await prisma.pageView.deleteMany({ where: { day: { lt: cutoff } } })
  await prisma.setting.deleteMany({ where: { key: { startsWith: SALT_PREFIX, lt: SALT_PREFIX + today } } })
  forgetSaltsBefore(today)
}
