import type { Metadata } from 'next'
import { locales, defaultLocale, type Locale } from '@/i18n/routing'
import { t as l10n, type L10n } from '@/lib/localized'

export const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '')

export const OG_LOCALE: Record<Locale, string> = { uz: 'uz_UZ', ru: 'ru_RU', en: 'en_US' }

export type Alternates = {
  canonical: string
  languages: Record<Locale | 'x-default', string>
}

function abs(locale: Locale, p: string): string {
  const rest = p === '/' || p === '' ? '' : p.startsWith('/') ? p : `/${p}`
  return `${SITE_URL}/${locale}${rest}`
}

/** Absolute hreflang map for a locale-less path ('/p/x', '/'). Canonical + x-default point to uz. */
export function alternatesFor(p: string): Alternates {
  const languages = {} as Alternates['languages']
  for (const l of locales) languages[l] = abs(l, p)
  languages['x-default'] = abs(defaultLocale, p)
  return { canonical: languages['x-default'], languages }
}

/** Next metadata `alternates` for the page in `locale` (canonical = this locale's own URL). */
export function metaAlternates(locale: Locale, p: string): NonNullable<Metadata['alternates']> {
  const a = alternatesFor(p)
  return { canonical: abs(locale, p), languages: a.languages }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncate(s: string, max = 160): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const sp = cut.lastIndexOf(' ')
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…'
}

export function pageMetadata(o: {
  locale: Locale
  path: string
  title: string
  description?: string
  image?: string
  siteName?: string
}): Metadata {
  const url = abs(o.locale, o.path)
  return {
    title: o.title,
    ...(o.description ? { description: o.description } : {}),
    alternates: metaAlternates(o.locale, o.path),
    openGraph: {
      title: o.title,
      ...(o.description ? { description: o.description } : {}),
      url,
      locale: OG_LOCALE[o.locale],
      type: 'website',
      ...(o.siteName ? { siteName: o.siteName } : {}),
      ...(o.image ? { images: [o.image] } : {}),
    },
  }
}

type LdProduct = { slug: string; brand: string; title: L10n; shortSpec: L10n; descriptionHtml?: L10n; images: string[] }
type LdVariant = { sku: string; priceUzs: number; stock: number }

export function productDescription(p: { shortSpec: L10n; descriptionHtml?: L10n }, locale: Locale): string {
  const short = stripHtml(l10n(p.shortSpec, locale))
  const text = short || stripHtml(l10n(p.descriptionHtml, locale))
  return truncate(text, 160)
}

/** schema.org Product with one Offer per variant. No ratings/reviews. */
export function productJsonLd(product: LdProduct, variants: LdVariant | LdVariant[], locale: Locale) {
  const list = Array.isArray(variants) ? variants : [variants]
  const url = abs(locale, `/p/${product.slug}`)
  const description = productDescription(product, locale)
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: l10n(product.title, locale),
    ...(description ? { description } : {}),
    url,
    ...(product.images.length ? { image: product.images.map((i) => new URL(i, SITE_URL).href) } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(list.length ? { sku: list[0].sku } : {}),
    ...(list.length ? { offers: list.map((v) => ({
      '@type': 'Offer',
      sku: v.sku,
      url,
      price: String(v.priceUzs),
      priceCurrency: 'UZS',
      availability: v.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    })) } : {}),
  }
}

/** JSON for a <script type="application/ld+json">; `<` escaped so content can't close the tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

type LdPost = {
  slug: string
  title: L10n
  excerpt: L10n
  contentHtml: L10n
  seoTitle?: L10n
  seoDescription?: L10n
  coverImage: string | null
  publishedAt: Date
  updatedAt: Date
}

/** Meta description for a post: SEO description, else excerpt, else the start of the body. */
export function postDescription(p: Pick<LdPost, 'excerpt' | 'contentHtml' | 'seoDescription'>, locale: Locale): string {
  const text = l10n(p.seoDescription, locale) || l10n(p.excerpt, locale) || stripHtml(l10n(p.contentHtml, locale))
  return truncate(text, 160)
}

/** schema.org BlogPosting for a blog post page. */
export function articleJsonLd(post: LdPost, locale: Locale) {
  const url = abs(locale, `/blog/${post.slug}`)
  const description = postDescription(post, locale)
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: truncate(l10n(post.seoTitle, locale) || l10n(post.title, locale), 110),
    ...(description ? { description } : {}),
    ...(post.coverImage ? { image: [new URL(post.coverImage, SITE_URL).href] } : {}),
    datePublished: post.publishedAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    inLanguage: locale,
    mainEntityOfPage: url,
    url,
  }
}
