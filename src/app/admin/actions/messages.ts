'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/admin/session'
import { broadcastMessage, sendCustomerMessage, type BroadcastResult, type MessageInput, type SendResult } from '@/lib/customer-messages'

// 'clients' permission (full admins and product managers). The library validates and writes the activity log.

export async function sendClientMessageAction(customerId: number, input: MessageInput): Promise<SendResult> {
  const staff = await requirePermission('clients')
  if (!Number.isSafeInteger(customerId)) return { ok: false, error: 'Client not found.' }
  const r = await sendCustomerMessage(customerId, input, staff)
  if (r.ok) revalidatePath(`/admin/clients/${customerId}`)
  return r
}

export async function broadcastMessageAction(input: MessageInput): Promise<BroadcastResult> {
  const staff = await requirePermission('clients')
  const r = await broadcastMessage(input, staff)
  if (r.ok) revalidatePath('/admin/messages')
  return r
}
