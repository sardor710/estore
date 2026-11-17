import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import type { Staff } from './session'

export const ACTIVITY_PAGE_SIZE = 50
const MAX_SUMMARY = 500

/** Audit trail for every mutating admin action. `action`: create | update | delete | status | login. */
export async function logActivity(
  actor: Staff,
  action: string,
  entity: string,
  entityId: string | number | null,
  summary: string,
): Promise<void> {
  await prisma.activityLog.create({
    data: {
      userId: actor.id > 0 ? actor.id : null,
      userEmail: actor.email,
      action,
      entity,
      entityId: entityId === null ? null : String(entityId),
      summary: summary.length > MAX_SUMMARY ? `${summary.slice(0, MAX_SUMMARY - 3)}...` : summary,
    },
  })
}

export type ActivityFilter = { userId?: number; entity?: string; from?: string; to?: string; page: number }

/** Start of a calendar day in Asia/Tashkent (UTC+5, no DST); null for anything but YYYY-MM-DD. */
function tashkentDayStart(day: string | undefined): Date | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const d = new Date(`${day}T00:00:00+05:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function listActivity(f: ActivityFilter) {
  const from = tashkentDayStart(f.from)
  const toStart = tashkentDayStart(f.to)
  const createdAt: Prisma.DateTimeFilter = {}
  if (from) createdAt.gte = from
  if (toStart) createdAt.lt = new Date(toStart.getTime() + 24 * 60 * 60 * 1000)
  const where: Prisma.ActivityLogWhereInput = {
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.entity ? { entity: f.entity } : {}),
    ...(from || toStart ? { createdAt } : {}),
  }
  const page = Number.isInteger(f.page) && f.page > 0 ? f.page : 1
  const [rows, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * ACTIVITY_PAGE_SIZE,
      take: ACTIVITY_PAGE_SIZE,
    }),
    prisma.activityLog.count({ where }),
  ])
  return { rows, total }
}

/** Distinct entity names for the filter dropdown. */
export async function activityEntities(): Promise<string[]> {
  const rows = await prisma.activityLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } })
  return rows.map((r) => r.entity)
}
