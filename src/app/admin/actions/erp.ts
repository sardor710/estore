'use server'

import { requirePermission } from '@/lib/admin/session'
import { logActivity } from '@/lib/admin/activity'
import { drainOutbox, retryOutbox } from '@/lib/erp/outbox'
import { runAfterResponse } from '@/lib/after-response'

export async function retryErpOutboxAction(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requirePermission('orders')
  if (!Number.isInteger(id)) return { ok: false, error: 'Unknown item.' }
  if (!(await retryOutbox(id))) return { ok: false, error: 'Already retried or done.' }
  await logActivity(staff, 'update', 'order', id, `Retried ERP push #${id}`)
  runAfterResponse(() => drainOutbox())
  return { ok: true }
}
