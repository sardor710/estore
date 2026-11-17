import { locales } from '@/i18n/routing'
import { UPLOAD_PATH_RE } from '@/lib/upload-path'
import type { L10n } from '@/lib/localized'
import type { FaqItem, Highlight, Section, SpecGroup } from '@/lib/catalog'

// Client-safe (no prisma): shared by server logic and the editor UI.
export type VariantInput = {
  id?: number
  sku: string
  name: L10n
  priceUzs: number
  compareAtUzs: number | null
  stock: number
  colorHex: string | null
  imageIndex: number | null
}

export type ProductInput = {
  slug: string
  categoryId: number
  templateOverride: 'SIMPLE' | 'DETAILED' | null
  brandId: number | null
  badge: string | null
  title: L10n
  subtitle: L10n
  shortSpec: L10n
  descriptionHtml: L10n
  sections: Section[]
  highlights: Highlight[]
  inTheBox: L10n[]
  faq: FaqItem[]
  specs: SpecGroup[]
  images: string[]
  reviewed: { uz: boolean; ru: boolean }
  /** Per-locale search-engine title / description (empty = storefront defaults). */
  seoTitle: L10n
  seoDescription: L10n
  variants: VariantInput[]
}

export const SEO_TITLE_MAX = 70
export const SEO_DESCRIPTION_MAX = 160

/** What the editor loaded: the save is rejected if the product or any variant's stock changed since. */
export type EditBaseline = { updatedAt: string; stock: Record<number, number> }

export const STALE_PRODUCT = 'This product was changed since you opened it (another tab, import refresh or translation). Reload the page to get the latest version, then redo your edits.'
export const STALE_STOCK = 'Stock changed since you opened this product (for example an order was confirmed). Reload the page to see the current stock, then redo your edits.'

export type ActionResult = { ok: true } | { ok: false; error: string }
export type BulkActionType = 'publish' | 'unpublish' | 'delete' | 'setCategory' | 'setBrand' | 'addToPromotion'
/** `value`: category id, brand id (omit = no brand) or promotion id, depending on the action. */
export type BulkActionInput = { type: BulkActionType; value?: number }
export type BulkResult = { done: number; skipped: { id: number; reason: string }[] }
export type UpdateResult = { ok: true } | { ok: false; errors: Record<string, string> }

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HEX_RE = /^#[0-9a-fA-F]{6}$/


/** Keeps only uz/ru/en string values; trims nothing (admin text is stored as typed). */
export function cleanL10n(v: unknown): L10n {
  const out: L10n = {}
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const l of locales) {
      const x = (v as Record<string, unknown>)[l]
      if (typeof x === 'string' && x !== '') out[l] = x
    }
  }
  return out
}


/** Product images: absolute http(s) URLs or our own uploads. */
export function isProductImageUrl(s: unknown): boolean {
  return isHttpUrl(s) || (typeof s === 'string' && UPLOAD_PATH_RE.test(s))
}

export function isHttpUrl(s: unknown): boolean {
  if (typeof s !== 'string' || !/^https?:\/\//i.test(s)) return false
  try {
    const u = new URL(s)
    return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.hostname)
  } catch {
    return false
  }
}

/** Reason a product cannot be published, or null when it can. */
export function checkPublishable(variants: { priceUzs: number }[]): string | null {
  if (variants.length === 0) return 'Add at least one variant before publishing.'
  if (variants.some((v) => !(v.priceUzs > 0))) return 'Every variant needs a price above 0 before publishing.'
  return null
}


// ---------- completeness ----------

const filled = (v: unknown, l: string): boolean => {
  const x = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>)[l] : undefined
  return typeof x === 'string' && x.trim() !== ''
}
const allLocales = (v: unknown) => locales.every((l) => filled(v, l))

/** The checklist, in display order (labels are what `completeness().missing` returns). */
export const COMPLETENESS_CHECKS = [
  'Every variant has a price above 0',
  'At least one image',
  'Title and description in uz, ru and en',
  'uz and ru translations marked reviewed',
  'At least one spec group',
  'SEO description in uz, ru and en',
] as const

export type CompletenessSource = {
  variants: { priceUzs: number }[]
  images: unknown
  title: unknown
  descriptionHtml: unknown
  reviewed: unknown
  specs: unknown
  seoDescription: unknown
}

/**
 * How ready a product is for the storefront: six equally weighted checks. `missing` lists the failed
 * checks in admin wording (the editor's checklist and the list's score both come from here).
 */
export function completeness(p: CompletenessSource): { score: number; missing: string[] } {
  const reviewed = (p.reviewed && typeof p.reviewed === 'object' ? p.reviewed : {}) as { uz?: unknown; ru?: unknown }
  const passed = [
    p.variants.length > 0 && p.variants.every((v) => v.priceUzs > 0),
    Array.isArray(p.images) && p.images.length > 0,
    allLocales(p.title) && allLocales(p.descriptionHtml),
    reviewed.uz === true && reviewed.ru === true,
    Array.isArray(p.specs) && p.specs.length > 0,
    allLocales(p.seoDescription),
  ]
  const missing: string[] = COMPLETENESS_CHECKS.filter((_, i) => !passed[i])
  return { score: Math.round(((passed.length - missing.length) / passed.length) * 100), missing }
}

/** Baseline for an editor that just loaded this product. */
export function baselineFromEditor(p: { updatedAt: string; input: { variants: { id?: number; stock: number }[] } }): EditBaseline {
  const stock: Record<number, number> = {}
  for (const v of p.input.variants) if (v.id !== undefined) stock[v.id] = v.stock
  return { updatedAt: p.updatedAt, stock }
}
