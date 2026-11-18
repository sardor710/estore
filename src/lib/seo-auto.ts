// Automatic SEO for products: builds a search-engine title and meta description per locale from the product's own
// text (title, brand, category, short spec / description). Pure and client-safe; no AI, so it always works and
// gives the same result for the same input. Prices are left out on purpose: a stored description would go stale
// when the price changes.

import { locales, type Locale } from '@/i18n/routing'
import type { L10n } from '@/lib/localized'
import { stripHtml } from '@/lib/seo'
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from '@/lib/admin/products-shared'

export type SeoSource = {
  title: L10n
  shortSpec: L10n
  descriptionHtml: L10n
  brand: string | null
  category: L10n | null
}

export type SeoFields = { seoTitle: L10n; seoDescription: L10n }

/** Below these lengths search engines usually rewrite the snippet themselves. */
export const SEO_TITLE_MIN = 30
export const SEO_DESCRIPTION_MIN = 70

const TITLE_SUFFIX: Record<Locale, [long: string, short: string]> = {
  uz: [' — Oʻzbekistonda narxi', ' — narxi'],
  ru: [' — купить, цена в Узбекистане', ' — цена'],
  en: [' — Price in Uzbekistan', ' — price'],
}

const DESCRIPTION_TAIL: Record<Locale, string> = {
  uz: 'Original mahsulot, Oʻzbekiston boʻylab yetkazib berish.',
  ru: 'Оригинальный товар, доставка по всему Узбекистану.',
  en: 'Original product with delivery across Uzbekistan.',
}

const own = (v: L10n | null | undefined, l: Locale): string => (v?.[l] ?? '').replace(/\s+/g, ' ').trim()

/** Cuts at a word boundary without an ellipsis (titles), or with one (descriptions). */
function cut(s: string, max: number, ellipsis: boolean): string {
  if (s.length <= max) return s
  const room = ellipsis ? max - 1 : max
  const head = s.slice(0, room)
  const sp = head.lastIndexOf(' ')
  const out = (sp > room * 0.5 ? head.slice(0, sp) : head).replace(/[\s,;:.\-—–(]+$/u, '')
  return ellipsis ? `${out}…` : out
}

/**
 * The product name with its brand in front when the title does not mention it yet. A locale without its own title
 * uses another locale's (model names read the same in every language); the words around it stay in this locale.
 */
function fullName(p: SeoSource, l: Locale): string {
  const title = own(p.title, l) || locales.map((x) => own(p.title, x)).find(Boolean) || ''
  const brand = (p.brand ?? '').trim()
  if (!title) return ''
  return brand && !title.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${title}` : title
}

/** Without the "(…)" details, e.g. "Anker Nano Charger (45W, Smart Display)" -> "Anker Nano Charger". */
const withoutDetails = (s: string) => s.replace(/\s*[([][^)\]]*[)\]]/g, '').replace(/\s+/g, ' ').trim()

export function autoSeoTitle(p: SeoSource, l: Locale): string {
  const name = fullName(p, l)
  if (!name) return ''
  const short = withoutDetails(name) || name
  const [long, brief] = TITLE_SUFFIX[l]
  const tries = [name + long, name + brief, short + long, short + brief, name, short]
  return tries.find((t) => t.length <= SEO_TITLE_MAX) ?? cut(short, SEO_TITLE_MAX, false)
}

/** First sentences of the short spec, else of the description, as plain text. */
function summary(p: SeoSource, l: Locale): string {
  const spec = stripHtml(own(p.shortSpec, l))
  const text = spec || stripHtml(own(p.descriptionHtml, l))
  return text.replace(/\s+/g, ' ').trim()
}

export function autoSeoDescription(p: SeoSource, l: Locale): string {
  const name = fullName(p, l)
  if (!name) return ''
  const tail = DESCRIPTION_TAIL[l]
  const about = summary(p, l)
  const category = own(p.category, l)
  // No text of its own in this locale: "<category>: <name>." (never another language's description).
  if (!about && category) {
    const s = `${category}: ${name}. ${tail}`
    if (s.length <= SEO_DESCRIPTION_MAX) return s
  }
  // "<name>: <about>." then the delivery line when it still fits.
  const head = about && !about.toLowerCase().startsWith(name.toLowerCase()) ? `${name}: ` : ''
  const sentence = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`)
  const withTail = (body: string) => `${body} ${tail}`
  if (!about) {
    const s = withTail(sentence(name))
    return s.length <= SEO_DESCRIPTION_MAX ? s : cut(sentence(name), SEO_DESCRIPTION_MAX, true)
  }
  const full = sentence(head + about)
  if (withTail(full).length <= SEO_DESCRIPTION_MAX) return withTail(full)
  // Keep the delivery line if at least a useful part of the text fits in front of it.
  const room = SEO_DESCRIPTION_MAX - tail.length - 1
  if (room >= 80) return withTail(cut(head + about, room, true))
  return cut(full, SEO_DESCRIPTION_MAX, true)
}

/**
 * Generated SEO title/description for every locale (none when the product has no title at all). `onlyEmpty`: keep what staff
 * already wrote and fill only the blank fields.
 */
export function autoSeo(p: SeoSource, current: Partial<SeoFields> = {}, opts: { onlyEmpty?: boolean } = {}): SeoFields {
  const seoTitle: L10n = { ...(current.seoTitle ?? {}) }
  const seoDescription: L10n = { ...(current.seoDescription ?? {}) }
  for (const l of locales) {
    if (!opts.onlyEmpty || !own(seoTitle, l)) {
      const t = autoSeoTitle(p, l)
      if (t) seoTitle[l] = t
    }
    if (!opts.onlyEmpty || !own(seoDescription, l)) {
      const d = autoSeoDescription(p, l)
      if (d) seoDescription[l] = d
    }
  }
  return { seoTitle, seoDescription }
}

export type SeoIssue = { locale: Locale; field: 'title' | 'description'; problem: 'missing' | 'too long' | 'too short' }

/** What is wrong with a product's SEO texts (empty = all good). */
export function seoIssues(f: Partial<SeoFields>): SeoIssue[] {
  const out: SeoIssue[] = []
  for (const l of locales) {
    const t = own(f.seoTitle, l)
    const d = own(f.seoDescription, l)
    if (!t) out.push({ locale: l, field: 'title', problem: 'missing' })
    else if (t.length > SEO_TITLE_MAX) out.push({ locale: l, field: 'title', problem: 'too long' })
    else if (t.length < SEO_TITLE_MIN) out.push({ locale: l, field: 'title', problem: 'too short' })
    if (!d) out.push({ locale: l, field: 'description', problem: 'missing' })
    else if (d.length > SEO_DESCRIPTION_MAX) out.push({ locale: l, field: 'description', problem: 'too long' })
    else if (d.length < SEO_DESCRIPTION_MIN) out.push({ locale: l, field: 'description', problem: 'too short' })
  }
  return out
}
