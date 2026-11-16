import { locales } from '@/i18n/routing'
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
  brand: string
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
  variants: VariantInput[]
}

export type ActionResult = { ok: true } | { ok: false; error: string }
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

