'use server'

import { requirePermission } from '@/lib/admin/session'
import { updateCustomer, type CustomerPatch, type CustomerResult } from '@/lib/customers'

// 'clients' permission; updateCustomer validates input and writes the activity log.
// Blocking takes effect on the next checkout (createOrder reads the flag), so nothing needs revalidating.

export async function updateCustomerAction(id: number, patch: CustomerPatch): Promise<CustomerResult> {
  const staff = await requirePermission('clients')
  return updateCustomer(id, patch, staff)
}
