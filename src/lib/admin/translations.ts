import { prisma } from '@/lib/db'
import { flattenMessages } from '@/i18n/merge'
import enMessages from '../../../messages/en.json'
import uzMessages from '../../../messages/uz.json'
import ruMessages from '../../../messages/ru.json'
import { locales } from '@/i18n/routing'
import { assertSameIcuArguments } from '@/lib/translate/apply'
import type { L10n } from '@/lib/localized'

export type UiRow = { key: string; en: string; uz: string; ru: string; overrides: L10n }

const FILES = { en: flattenMessages(enMessages), uz: flattenMessages(uzMessages), ru: flattenMessages(ruMessages) }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** All UI keys (from en.json) with the effective value per locale and the stored overrides. */
export async function listUiRows(): Promise<UiRow[]> {
  const stored = new Map((await prisma.uiString.findMany()).map((r) => [r.key, isObj(r.value) ? (r.value as L10n) : {}]))
  return Object.keys(FILES.en).map((key) => {
    const o = stored.get(key) ?? {}
    const eff = (l: 'en' | 'uz' | 'ru') => (typeof o[l] === 'string' && o[l]!.trim() ? o[l]! : (FILES[l][key] ?? ''))
    return { key, en: eff('en'), uz: eff('uz'), ru: eff('ru'), overrides: o }
  })
}

export type SaveUiResult = { ok: true; saved: number } | { ok: false; error: string }

/**
 * Stores edited cells. `edits` holds the full text the admin typed per key/locale. A cell equal to the
 * messages-file value is not stored (no pointless override); a cleared cell removes its override.
 * ICU placeholders must match the English source, otherwise a page would crash at render time.
 */
export async function saveUiStrings(edits: { key: string; values: L10n }[]): Promise<SaveUiResult> {
  const writes: { key: string; next: Record<string, string> }[] = []
  for (const { key, values } of edits) {
    if (!(key in FILES.en)) return { ok: false, error: `Unknown key: ${key}` }
    const existing = await prisma.uiString.findUnique({ where: { key } })
    const next: Record<string, string> = isObj(existing?.value) ? { ...(existing!.value as Record<string, string>) } : {}
    for (const l of locales) {
      const raw = values[l]
      if (raw === undefined) continue
      const v = raw.trim()
      if (v === '' || v === (FILES[l][key] ?? '')) delete next[l]
      else {
        if (l !== 'en') {
          try {
            assertSameIcuArguments(FILES.en[key], v)
          } catch (e) {
            return { ok: false, error: `${key} (${l}): ${e instanceof Error ? e.message : 'placeholder mismatch'}` }
          }
        }
        next[l] = v
      }
    }
    writes.push({ key, next })
  }
  await prisma.$transaction(
    writes.map(({ key, next }) =>
      Object.keys(next).length === 0
        ? prisma.uiString.deleteMany({ where: { key } })
        : prisma.uiString.upsert({ where: { key }, create: { key, value: next }, update: { value: next } }),
    ),
  )
  return { ok: true, saved: writes.length }
}

export type SpecLabelRow = { key: string; label: L10n }

export async function listSpecLabels(): Promise<SpecLabelRow[]> {
  const rows = await prisma.specLabel.findMany({ orderBy: { key: 'asc' } })
  return rows.map((r) => ({ key: r.key, label: isObj(r.label) ? (r.label as L10n) : {} }))
}

export async function saveSpecLabels(edits: SpecLabelRow[]): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const e of edits) if (!e.key.trim()) return { ok: false, error: 'Spec key cannot be empty.' }
  await prisma.$transaction(
    edits.map((e) => {
      const label: L10n = {}
      for (const l of locales) if (e.label[l]?.trim()) label[l] = e.label[l]!.trim()
      return prisma.specLabel.upsert({ where: { key: e.key }, create: { key: e.key, label }, update: { label } })
    }),
  )
  return { ok: true }
}
