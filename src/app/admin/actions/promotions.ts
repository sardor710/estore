'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/admin/session'
import { deletePromotion, savePromotion, togglePromotion, type PromotionInput, type PromotionResult } from '@/lib/admin/promotions'

// 'promotions' permission; the lib functions validate input and write the activity log.
// Prices are computed on every storefront render, so refreshing the router cache is all that is needed.

function refreshStorefront() {
  revalidatePath('/', 'layout')
}

export async function savePromotionAction(input: PromotionInput): Promise<PromotionResult> {
  const staff = await requirePermission('promotions')
  const r = await savePromotion(input, staff)
  if (r.ok) refreshStorefront()
  return r
}

export async function togglePromotionAction(id: number, enabled: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requirePermission('promotions')
  const r = await togglePromotion(id, enabled, staff)
  if (r.ok) refreshStorefront()
  return r
}

export async function deletePromotionAction(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requirePermission('promotions')
  const r = await deletePromotion(id, staff)
  if (r.ok) refreshStorefront()
  return r
}
