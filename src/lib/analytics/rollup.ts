import { prisma } from '@/lib/db'
import { tashkentDay } from './visitor'

export const RAW_RETENTION_DAYS = 180
const DAY_MS = 86_400_000

/**
 * Folds raw page views of every finished day into DailyTraffic (views + distinct visitors, idempotent,
 * only writes rows that changed) and deletes raw rows older than RAW_RETENTION_DAYS. Today stays raw.
 */
export async function rollupAndPrune(now: Date): Promise<void> {
  const today = tashkentDay(now)
  const perVisitor = await prisma.pageView.groupBy({
    by: ['day', 'visitorHash'],
    where: { day: { lt: today } },
    _count: { _all: true },
  })
  const totals = new Map<string, { views: number; visitors: number }>()
  for (const r of perVisitor) {
    const t = totals.get(r.day) ?? { views: 0, visitors: 0 }
    t.views += r._count._all
    t.visitors += 1
    totals.set(r.day, t)
  }
  if (totals.size) {
    const existing = new Map((await prisma.dailyTraffic.findMany({ where: { day: { in: [...totals.keys()] } } })).map((r) => [r.day, r]))
    for (const [day, t] of totals) {
      const cur = existing.get(day)
      if (cur && cur.views === t.views && cur.visitors === t.visitors) continue
      await prisma.dailyTraffic.upsert({ where: { day }, update: t, create: { day, ...t } })
    }
  }
  const cutoff = tashkentDay(new Date(now.getTime() - RAW_RETENTION_DAYS * DAY_MS))
  await prisma.pageView.deleteMany({ where: { day: { lt: cutoff } } })
}
