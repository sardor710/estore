'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/admin/session'
import { broadcastMessage, sendCustomerMessage, type BroadcastResult, type SendResult } from '@/lib/customer-messages'

// 'clients' permission (full admins and product managers). The library validates and writes the activity log.

export async function sendClientMessageAction(customerId: number, text: string): Promise<SendResult> {
  const staff = await requirePermission('clients')
  if (!Number.isSafeInteger(customerId)) return { ok: false, error: 'Client not found.' }
  const r = await sendCustomerMessage(customerId, text, staff)
  if (r.ok) revalidatePath(`/admin/clients/${customerId}`)
  return r
}

export async function broadcastMessageAction(text: string): Promise<BroadcastResult> {
  const staff = await requirePermission('clients')
  const r = await broadcastMessage(text, staff)
  if (r.ok) revalidatePath('/admin/messages')
  return r
}
