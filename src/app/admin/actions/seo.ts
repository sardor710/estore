'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/admin/session'
import { logActivity } from '@/lib/admin/activity'
import { autoFillAllSeo, suggestSeo } from '@/lib/admin/seo'
import type { SeoFields } from '@/lib/seo-auto'

// 'catalog' permission (SEO texts are part of the product).

/** Product editor: generated SEO texts for the draft on screen (nothing is saved here). */
export async function suggestSeoAction(
  draft: { title: unknown; shortSpec: unknown; descriptionHtml: unknown; brandId: unknown; categoryId: unknown; seoTitle: unknown; seoDescription: unknown },
  onlyEmpty: boolean,
): Promise<SeoFields> {
  await requirePermission('catalog')
  return suggestSeo(draft, onlyEmpty)
}

/** SEO page: fill blank SEO texts (or rewrite all of them) for the chosen products, or every product. */
export async function autoSeoAction(opts: { overwrite: boolean; ids?: number[] }): Promise<{ changed: number }> {
  const staff = await requirePermission('catalog')
  const ids = Array.isArray(opts.ids) ? opts.ids.filter((n) => Number.isInteger(n)) : undefined
  const changed = await autoFillAllSeo({ overwrite: opts.overwrite === true, ids })
  if (changed) {
    await logActivity(staff, 'update', 'product', ids?.length === 1 ? ids[0] : null, `Auto SEO: ${opts.overwrite ? 'rewrote' : 'filled'} SEO texts of ${changed} product(s)`)
    revalidatePath('/', 'layout')
  }
  return { changed }
}
