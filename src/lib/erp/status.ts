import { prisma } from '@/lib/db'
import { erpEnabled } from './client'

export type ErpStatus = {
  enabled: boolean
  lastReconcileAt: string | null
  lastResult: { stockChanged: number; priceChanged: number; missingInErp: string[]; missingPrice: string[]; skus: number } | null
  pending: number
  unlinked: number
  failed: { id: number; ref: string; kind: string; orderId: number; lastError: string | null; attempts: number }[]
}

export async function getErpStatus(): Promise<ErpStatus> {
  const [last, result, pending, unlinked, failed] = await Promise.all([
    prisma.setting.findUnique({ where: { key: 'erp.lastReconcileAt' } }),
    prisma.setting.findUnique({ where: { key: 'erp.lastReconcileResult' } }),
    prisma.erpOutbox.count({ where: { status: { in: ['PENDING', 'RUNNING'] } } }),
    prisma.variant.count({ where: { erpLinkedAt: null } }),
    prisma.erpOutbox.findMany({
      where: { status: 'FAILED' },
      orderBy: { id: 'desc' },
      take: 20,
      select: { id: true, ref: true, kind: true, orderId: true, lastError: true, attempts: true },
    }),
  ])
  let lastResult: ErpStatus['lastResult'] = null
  try {
    lastResult = result ? JSON.parse(result.value) : null
  } catch {
    lastResult = null
  }
  return { enabled: erpEnabled(), lastReconcileAt: last?.value ?? null, lastResult, pending, unlinked, failed }
}
