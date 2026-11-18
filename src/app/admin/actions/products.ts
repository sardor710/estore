'use server'

import { revalidatePath } from 'next/cache'
import { resetSearchCache } from '@/lib/search/service'
import { requirePermission } from '@/lib/admin/session'
import { logActivity } from '@/lib/admin/activity'
import {
  bulkAction,
  duplicateProduct,
  publishProduct,
  unpublishProduct,
  updateProduct,
  updateVariantInline,
  type BulkActionInput,
  type BulkResult,
  type EditBaseline,
  type InlineVariantResult,
  type ProductInput,
} from '@/lib/admin/products'
import { loadEditorProduct, type EditorProduct } from '@/lib/admin/product-view'
import { saveSpecLabels, type SpecLabelRow } from '@/lib/admin/translations'
import { translateProduct, TranslationError } from '@/lib/translate'
import type { L10n } from '@/lib/localized'

// 'catalog' permission, re-checked against the DB on every call; every change is written to the activity log
// (here, or by the lib function that takes the staff member).

/** Storefront pages must reflect admin edits. */
function refreshStorefront() {
  revalidatePath('/', 'layout')
  resetSearchCache() // live search must not show unpublished/renamed items for its cache lifetime
}

export type SaveProductResult =
  | { ok: true; fresh: EditorProduct }
  | { ok: false; errors: Record<string, string> }

export async function saveProductAction(
  id: number,
  input: ProductInput,
  labels: Record<string, L10n>,
  baseline: EditBaseline,
): Promise<SaveProductResult> {
  const staff = await requirePermission('catalog')
  const r = await updateProduct(id, input, baseline)
  if (!r.ok) return r
  // The product row is already written: log it now, even if the spec labels below fail.
  await logActivity(staff, 'update', 'product', id, `Updated product #${id}`)
  const rows: SpecLabelRow[] = Object.entries(labels).map(([key, label]) => ({ key, label }))
  if (rows.length) {
    const l = await saveSpecLabels(rows)
    if (!l.ok) {
      refreshStorefront()
      return { ok: false, errors: { specs: l.error } }
    }
    await logActivity(staff, 'update', 'translations', null, `Saved ${rows.length} spec label(s) from product #${id}`)
  }
  refreshStorefront()
  // The editor continues from what is now in the DB (new updatedAt and stock baseline).
  const fresh = await loadEditorProduct(id)
  if (!fresh) return { ok: false, errors: { _: 'Product not found.' } }
  return { ok: true, fresh }
}

export async function publishAction(id: number, publish: boolean): Promise<{ ok: true; fresh: EditorProduct | null } | { ok: false; error: string }> {
  const staff = await requirePermission('catalog')
  const r = publish ? await publishProduct(id) : await unpublishProduct(id)
  if (!r.ok) return r
  await logActivity(staff, 'update', 'product', id, `${publish ? 'Published' : 'Unpublished'} product #${id}`)
  refreshStorefront()
  return { ok: true, fresh: await loadEditorProduct(id) }
}

export type TranslateActionResult =
  | { ok: true; status: 'done' | 'not_configured'; translated: number; fresh: EditorProduct | null }
  | { ok: false; message: string }

export async function translateProductAction(id: number, force: boolean): Promise<TranslateActionResult> {
  const staff = await requirePermission('catalog')
  try {
    const r = await translateProduct(id, { force })
    if (r.status === 'done') {
      if (r.translated > 0) await logActivity(staff, 'update', 'product', id, `Machine-translated ${r.translated} field(s) of product #${id}`)
      refreshStorefront()
    }
    return { ok: true, status: r.status, translated: r.translated, fresh: await loadEditorProduct(id) }
  } catch (e) {
    return { ok: false, message: e instanceof TranslationError || e instanceof Error ? e.message : 'Translation failed.' }
  }
}

export async function bulkProductsAction(ids: number[], action: BulkActionInput): Promise<BulkResult> {
  const staff = await requirePermission('catalog')
  const r = await bulkAction(ids, action, staff)
  if (r.done > 0) {
    refreshStorefront()
    revalidatePath('/admin/products')
  }
  return r
}

export async function updateVariantInlineAction(
  variantId: number,
  patch: { priceUzs?: number; stock?: number },
  expected?: { priceUzs?: number; stock?: number },
): Promise<InlineVariantResult> {
  const staff = await requirePermission('catalog')
  const r = await updateVariantInline(variantId, patch, staff, expected)
  if (r.ok) refreshStorefront()
  return r
}

export async function duplicateProductAction(id: number): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const staff = await requirePermission('catalog')
  if (!Number.isInteger(id)) return { ok: false, error: 'Product not found.' }
  try {
    return { ok: true, id: await duplicateProduct(id, staff) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not duplicate the product.' }
  }
}
