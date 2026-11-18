'use server'

import { revalidatePath } from 'next/cache'
import { resetSearchCache } from '@/lib/search/service'
import { requirePermission } from '@/lib/admin/session'
import { logActivity } from '@/lib/admin/activity'
import { saveSpecLabels, saveUiStrings, type SpecLabelRow } from '@/lib/admin/translations'
import { createCategory, updateCategory, type CategoryInput } from '@/lib/admin/categories'
import { saveSettings, sendTestMessage, type SettingsInput } from '@/lib/admin/settings'
import { runImport, runRefresh, type ImportOutcome } from '@/lib/admin/import'
import { isOrderStatus } from '@/lib/admin/orders'
import { setOrderStatus } from '@/lib/orders'
import { notifyOrderStatus } from '@/lib/account/notify'
import { runAfterResponse } from '@/lib/after-response'
import { can } from '@/lib/permissions'
import { translateUiMissing } from '@/lib/translate'
import type { NotifyResult } from '@/lib/telegram'
import { connectBotWebhook } from '@/lib/telegram-bot/webhook'
import type { L10n } from '@/lib/localized'

// Every action re-checks the caller's permission against the DB (requirePermission) and records what it
// changed (logActivity): the proxy and the hidden menu items are not security. Product editing actions live in
// ./actions/products.ts.

/** Storefront pages (and their UI strings) must reflect admin edits. */
function refreshStorefront() {
  revalidatePath('/', 'layout')
  resetSearchCache() // live search must not show unpublished/renamed items for its cache lifetime
}

// ---------- import ----------

export async function importAction(url: string, categoryId: number | null): Promise<ImportOutcome> {
  const staff = await requirePermission('catalog')
  const r = await runImport(url, categoryId ?? undefined)
  if (r.ok && r.created) {
    await logActivity(staff, 'create', 'product', r.productId, `Imported product #${r.productId} from ${url}`)
    refreshStorefront()
  }
  return r
}

export async function refreshImportAction(productId: number): Promise<{ ok: true } | { ok: false; message: string }> {
  const staff = await requirePermission('catalog')
  const r = await runRefresh(productId)
  if (r.ok) {
    await logActivity(staff, 'update', 'product', productId, `Refreshed imported product #${productId} from its source`)
    refreshStorefront()
  }
  return r
}

// ---------- orders ----------

export async function setOrderStatusAction(orderId: number, to: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requirePermission('orders')
  if (!isOrderStatus(to)) return { ok: false, error: 'BAD_REQUEST' }
  const r = await setOrderStatus(orderId, to)
  if (r.ok) {
    await logActivity(staff, 'status', 'order', orderId, `Order status -> ${to}`)
    // Telegram message to the customer (if they have an account) after the response; never blocks or fails the change.
    runAfterResponse(() => notifyOrderStatus(orderId, to))
  }
  revalidatePath('/admin/orders')
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}

// ---------- categories ----------

export async function saveCategoryAction(
  id: number | null,
  input: CategoryInput,
): Promise<{ ok: true; id: number } | { ok: false; errors: Record<string, string> }> {
  const staff = await requirePermission('catalog')
  const r = id === null ? await createCategory(input) : await updateCategory(id, input)
  if (r.ok) {
    await logActivity(staff, id === null ? 'create' : 'update', 'category', r.id, `${id === null ? 'Created' : 'Updated'} category "${input.slug}"`)
    refreshStorefront()
    revalidatePath('/admin/categories')
  }
  return r
}

// ---------- translations ----------

export async function saveUiAction(edits: { key: string; values: L10n }[]) {
  const staff = await requirePermission('translations')
  const r = await saveUiStrings(edits)
  if (r.ok) {
    await logActivity(staff, 'update', 'translations', null, `Saved ${r.saved} UI string(s)`)
    refreshStorefront()
  }
  return r
}

export async function saveSpecLabelsAction(rows: SpecLabelRow[]) {
  const staff = await requirePermission('translations')
  const r = await saveSpecLabels(rows)
  if (r.ok) {
    await logActivity(staff, 'update', 'translations', null, `Saved ${rows.length} spec label(s)`)
    refreshStorefront()
  }
  return r
}

export async function translateUiMissingAction(): Promise<
  { ok: true; status: 'done' | 'not_configured'; translated: number } | { ok: false; message: string }
> {
  const staff = await requirePermission('translations')
  try {
    const r = await translateUiMissing()
    if (r.status === 'done') {
      if (r.translated > 0) await logActivity(staff, 'update', 'translations', null, `Machine-translated ${r.translated} missing UI string(s)`)
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
  const staff = await requirePermission('settings.business')
  // Per-field re-check: integration fields need 'settings.integrations' (saveSettings refuses them otherwise).
  const r = await saveSettings(input, { integrations: can(staff.role, 'settings.integrations') })
  if (r.ok) {
    if (r.changed.length) await logActivity(staff, 'update', 'settings', null, `Changed settings: ${r.changed.join(', ')}`)
    refreshStorefront()
    revalidatePath('/admin/settings')
  }
  return r
}

export async function testTelegramAction(): Promise<NotifyResult> {
  await requirePermission('settings.integrations')
  return sendTestMessage()
}

/** Registers `${SITE_URL}/api/telegram/webhook` with Telegram so the bot handles customer sign-ins in production. */
export async function connectBotWebhookAction(): Promise<{ ok: true; username: string | null } | { ok: false; error: string }> {
  const staff = await requirePermission('settings.integrations')
  const r = await connectBotWebhook()
  if (!r.ok) return r
  await logActivity(
    staff,
    'update',
    'settings',
    null,
    `Connected the Telegram bot${r.username ? ` @${r.username}` : ''} to ${r.url}${r.warnings.length ? ` (warnings: ${r.warnings.join('; ')})` : ''}`,
  )
  return { ok: true, username: r.username }
}
