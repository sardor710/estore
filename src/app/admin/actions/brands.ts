'use server'

import { revalidatePath } from 'next/cache'
import { resetSearchCache } from '@/lib/search/service'
import { requirePermission } from '@/lib/admin/session'
import { deleteBrand, saveBrand, type BrandInput, type BrandResult } from '@/lib/admin/brands'

// 'catalog' permission; the lib functions validate input and write the activity log.

function refreshStorefront() {
  revalidatePath('/', 'layout')
  resetSearchCache() // live search must not show unpublished/renamed items for its cache lifetime
}

export async function saveBrandAction(input: BrandInput): Promise<BrandResult> {
  const staff = await requirePermission('catalog')
  const r = await saveBrand(input, staff)
  if (r.ok) refreshStorefront() // brand names show on product pages
  return r
}

export async function deleteBrandAction(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requirePermission('catalog')
  if (!Number.isInteger(id)) return { ok: false, error: 'Brand not found.' }
  const r = await deleteBrand(id, staff)
  if (r.ok) refreshStorefront()
  return r
}
