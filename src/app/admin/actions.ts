'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/session'
import { publishProduct, unpublishProduct, updateProduct, type ProductInput } from '@/lib/admin/products'
import { loadEditorProduct, type EditorProduct } from '@/lib/admin/product-view'
import { saveSpecLabels, saveUiStrings, type SpecLabelRow } from '@/lib/admin/translations'
import { createCategory, updateCategory, type CategoryInput } from '@/lib/admin/categories'
import { saveSettings, sendTestMessage, type SettingsInput } from '@/lib/admin/settings'
import { runImport, runRefresh, type ImportOutcome } from '@/lib/admin/import'
import { isOrderStatus } from '@/lib/admin/orders'
import { setOrderStatus } from '@/lib/orders'
import { translateProduct, translateUiMissing, TranslationError } from '@/lib/translate'
import type { NotifyResult } from '@/lib/telegram'
import type { L10n } from '@/lib/localized'

/** Storefront pages (and their UI strings) must reflect admin edits. */
function refreshStorefront() {
  revalidatePath('/', 'layout')
}

// ---------- products ----------

export type SaveProductResult =
  | { ok: true; updatedAt: string; labels: Record<string, L10n> }
  | { ok: false; errors: Record<string, string> }

export async function saveProductAction(id: number, input: ProductInput, labels: Record<string, L10n>): Promise<SaveProductResult> {
  await requireAdmin()
  const r = await updateProduct(id, input)
  if (!r.ok) return r
  const rows: SpecLabelRow[] = Object.entries(labels).map(([key, label]) => ({ key, label }))
  if (rows.length) {
    const l = await saveSpecLabels(rows)
    if (!l.ok) return { ok: false, errors: { specs: l.error } }
  }
  refreshStorefront()
  const fresh = await loadEditorProduct(id)
  return { ok: true, updatedAt: fresh?.updatedAt ?? '', labels: fresh?.labels ?? labels }
}

export async function publishAction(id: number, publish: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin()
  const r = publish ? await publishProduct(id) : await unpublishProduct(id)
  if (r.ok) refreshStorefront()
  return r
}

export type TranslateActionResult =
  | { ok: true; status: 'done' | 'not_configured'; translated: number; fresh: EditorProduct | null }
  | { ok: false; message: string }

export async function translateProductAction(id: number, force: boolean): Promise<TranslateActionResult> {
  await requireAdmin()
  try {
    const r = await translateProduct(id, { force })
    if (r.status === 'done') refreshStorefront()
    return { ok: true, status: r.status, translated: r.translated, fresh: await loadEditorProduct(id) }
  } catch (e) {
    return { ok: false, message: e instanceof TranslationError || e instanceof Error ? e.message : 'Translation failed.' }
  }
}

// ---------- import ----------

export async function importAction(url: string, categoryId: number | null): Promise<ImportOutcome> {
  await requireAdmin()
  const r = await runImport(url, categoryId ?? undefined)
  if (r.ok && r.created) refreshStorefront()
  return r
}

export async function refreshImportAction(productId: number): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireAdmin()
  const r = await runRefresh(productId)
  if (r.ok) refreshStorefront()
  return r
}

// ---------- orders ----------

export async function setOrderStatusAction(orderId: number, to: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin()
  if (!isOrderStatus(to)) return { ok: false, error: 'BAD_REQUEST' }
  const r = await setOrderStatus(orderId, to)
  revalidatePath('/admin/orders')
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}

// ---------- categories ----------

export async function saveCategoryAction(
  id: number | null,
  input: CategoryInput,
): Promise<{ ok: true; id: number } | { ok: false; errors: Record<string, string> }> {
  await requireAdmin()
  const r = id === null ? await createCategory(input) : await updateCategory(id, input)
  if (r.ok) {
    refreshStorefront()
    revalidatePath('/admin/categories')
  }
  return r
}

// ---------- translations ----------

export async function saveUiAction(edits: { key: string; values: L10n }[]) {
  await requireAdmin()
  const r = await saveUiStrings(edits)
  if (r.ok) refreshStorefront()
  return r
}

export async function saveSpecLabelsAction(rows: SpecLabelRow[]) {
  await requireAdmin()
  const r = await saveSpecLabels(rows)
  if (r.ok) refreshStorefront()
  return r
}

export async function translateUiMissingAction(): Promise<
  { ok: true; status: 'done' | 'not_configured'; translated: number } | { ok: false; message: string }
> {
  await requireAdmin()
  try {
    const r = await translateUiMissing()
    if (r.status === 'done') {
      refreshStorefront()
      revalidatePath('/admin/translations')
    }
    return { ok: true, ...r }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Translation failed.' }
  }
}

// ---------- settings ----------

export async function saveSettingsAction(input: SettingsInput) {
  await requireAdmin()
  const r = await saveSettings(input)
  if (r.ok) {
    refreshStorefront()
    revalidatePath('/admin/settings')
  }
  return r
}

export async function testTelegramAction(): Promise<NotifyResult> {
  await requireAdmin()
  return sendTestMessage()
}
