import { prisma } from '@/lib/db'
import { storefrontWhere } from '@/lib/visibility'
import { locales, type Locale } from '@/i18n/routing'
import { t as l10n, type L10n } from '@/lib/localized'
import { loadPricer } from '@/lib/promotions'
import { toCard, type CardProduct } from '@/lib/catalog'
import { tokenize } from './text'
import { rank, type SearchDoc } from './rank'

export type Suggestions = {
  products: { slug: string; title: string; image: string | null; priceUzs: number; compareAtUzs: number | null }[]
  categories: { slug: string; name: string }[]
}

const SUGGEST_PRODUCTS = 6
const SUGGEST_CATEGORIES = 3
const TTL_MS = 15_000

const asL10n = (v: unknown): L10n => (v && typeof v === 'object' && !Array.isArray(v) ? (v as L10n) : {})
const otherLocales = (field: L10n, locale: Locale) => locales.filter((l) => l !== locale).map((l) => field[l] ?? '').join(' ')

async function loadRows() {
  return prisma.product.findMany({
    where: storefrontWhere(),
    include: { variants: true, brand: { select: { name: true } }, category: { select: { name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
}
type Row = Awaited<ReturnType<typeof loadRows>>[number]
type Cat = { id: number; slug: string; name: unknown }
type Index = { rows: Row[]; byId: Map<number, Row>; cats: Cat[]; docs: Map<Locale, { products: SearchDoc[]; cats: SearchDoc[] }> }

async function loadIndex(): Promise<Index> {
  const [rows, cats] = await Promise.all([loadRows(), prisma.category.findMany({ select: { id: true, slug: true, name: true } })])
  return { rows, byId: new Map(rows.map((r) => [r.id, r])), cats, docs: new Map() }
}

// Rows, categories and the per-locale token index are cached briefly, so a burst of keystrokes costs one query and
// one tokenizing pass. Off under tests (VITEST) unless a test turns it on with setSearchCacheEnabled.
let cache: { at: number; index: Promise<Index> } | null = null
let cacheEnabled = !process.env.VITEST
export function setSearchCacheEnabled(on: boolean) {
  cacheEnabled = on
}
function index(): Promise<Index> {
  if (!cacheEnabled) return loadIndex()
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const entry = { at: Date.now(), index: loadIndex() }
    cache = entry
    entry.index.catch(() => {
      if (cache === entry) cache = null
    })
  }
  return cache.index
}
export function resetSearchCache() {
  cache = null
}

function docsFor(ix: Index, locale: Locale) {
  let d = ix.docs.get(locale)
  if (!d) {
    d = { products: ix.rows.map((r) => buildDoc(r, locale)), cats: ix.cats.map((c) => catDoc(c, locale)) }
    ix.docs.set(locale, d)
  }
  return d
}

function catDoc(c: Cat, locale: Locale): SearchDoc {
  const name = asL10n(c.name)
  return {
    id: c.id,
    tokens: { titleLocal: tokenize(name[locale] ?? ''), title: tokenize(otherLocales(name, locale)), brand: [], category: [], spec: [], sku: [] },
    skuCompact: [],
  }
}

export function buildDoc(row: Row, locale: Locale): SearchDoc {
  const title = asL10n(row.title)
  const spec = asL10n(row.shortSpec)
  const category = asL10n(row.category?.name)
  const skus = row.variants.map((v) => v.sku)
  return {
    id: row.id,
    tokens: {
      titleLocal: tokenize(title[locale] ?? ''),
      title: tokenize(otherLocales(title, locale)),
      brand: tokenize(row.brand?.name ?? ''),
      category: tokenize(locales.map((l) => category[l] ?? '').join(' ')),
      spec: tokenize(locales.map((l) => spec[l] ?? '').join(' ')),
      sku: skus.flatMap(tokenize),
    },
    skuCompact: skus.map((s) => tokenize(s).join('')),
  }
}

async function rankedRows(q: string, locale: Locale, ix?: Index): Promise<Row[]> {
  if (!tokenize(q).length) return []
  const idx = ix ?? (await index())
  return rank(q, docsFor(idx, locale).products).map((id) => idx.byId.get(id)!)
}

/** Storefront products matching `q` (typos, prefixes, Latin/Cyrillic), best first. */
export async function searchProducts(q: string, locale: Locale, limit?: number, ix?: Index): Promise<CardProduct[]> {
  const hits = await rankedRows(q.trim().slice(0, 100), locale, ix)
  if (!hits.length) return []
  const price = await loadPricer()
  return (limit ? hits.slice(0, limit) : hits).map((r) => toCard(r, price))
}

/** Live suggestions for the search field: up to 6 products and 3 categories (empty below 2 characters). */
export async function suggest(q: string, locale: Locale): Promise<Suggestions> {
  const query = q.trim().slice(0, 100)
  if (query.length < 2) return { products: [], categories: [] }
  const ix = await index()
  const cards = await searchProducts(query, locale, SUGGEST_PRODUCTS, ix)
  const catById = new Map(ix.cats.map((c) => [c.id, c]))
  return {
    products: cards.map((c) => ({
      slug: c.slug,
      title: l10n(c.title, locale),
      image: c.image,
      priceUzs: c.minPriceUzs,
      compareAtUzs: c.compareAtUzs,
    })),
    categories: rank(query, docsFor(ix, locale).cats)
      .slice(0, SUGGEST_CATEGORIES)
      .map((id) => {
        const c = catById.get(id)!
        return { slug: c.slug, name: l10n(asL10n(c.name), locale) }
      }),
  }
}
