'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/admin/session'
import { deleteBanner, reorderBanners, saveBanner, setBannerActive, type BannerInput, type BannerResult } from '@/lib/admin/banners'

// 'banners' permission (full admin, product manager); the lib functions validate input and write the activity log.

function refreshStorefront() {
  revalidatePath('/', 'layout')
}

type Simple = { ok: true } | { ok: false; error: string }

export async function saveBannerAction(input: BannerInput): Promise<BannerResult> {
  const staff = await requirePermission('banners')
  const r = await saveBanner(input, staff)
  if (r.ok) refreshStorefront()
  return r
}

export async function deleteBannerAction(id: number): Promise<Simple> {
  const staff = await requirePermission('banners')
  const r = await deleteBanner(id, staff)
  if (r.ok) refreshStorefront()
  return r
}

export async function toggleBannerAction(id: number, active: boolean): Promise<Simple> {
  const staff = await requirePermission('banners')
  const r = await setBannerActive(id, active, staff)
  if (r.ok) refreshStorefront()
  return r
}

export async function reorderBannersAction(ids: number[]): Promise<Simple> {
  const staff = await requirePermission('banners')
  const r = await reorderBanners(ids, staff)
  if (r.ok) refreshStorefront()
  return r
}
