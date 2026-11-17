import { prisma } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { bestPrice } from '@/lib/pricing'
import { categoryAncestry, loadActiveRules, priceTargetFor } from '@/lib/promotions'
import type { L10n } from '@/lib/localized'
import { completeness } from './products-shared'
import { variantThumb } from './variant-display'

// Admin product list: URL params -> filters, sorting and paging over computed per-product facts
// (price range, stock state, completeness, active promotion). The catalog is small (hundreds of
// products), so filtering on the computed facts happens in memory after one query.

export const PRODUCTS_PAGE_SIZE = 25

export type StockState = 'in' | 'low' | 'out'
export type ProductSort = 'updated' | 'title' | 'price' | 'stock' | 'created'

export type ProductListParams = {
  q?: string
  categoryId?: number
  brandId?: number
  status?: 'DRAFT' | 'PUBLISHED'
  stock?: StockState
  priceMin?: number
  priceMax?: number
  promo?: boolean
  incomplete?: boolean
  sort?: ProductSort
  dir?: 'asc' | 'desc'
  page?: number
}

export type ProductRowVariant = { id: number; sku: string; name: string; priceUzs: number; stock: number; colorHex: string | null; image: string | null }

export type ProductRow = {
  id: number
  slug: string
  title: string
  status: string
  isDemo: boolean
  image: string | null
  category: string
  brand: string | null
  variants: ProductRowVariant[]
  minPrice: number
  maxPrice: number
  totalStock: number
  /** Stock of the variant with the least stock. */
  minStock: number
  /** Some variant is at or below the low-stock threshold while the product is not sold out. */
  lowStock: boolean
  stockState: StockState
  completeness: number
  missing: string[]
  /** Name of the promotion currently lowering this product's price, if any. */
  promo: string | null
  updatedAt: Date
  createdAt: Date
}

export const PRODUCT_SORTS: readonly ProductSort[] = ['updated', 'title', 'price', 'stock', 'created']
const STOCK_STATES: readonly string[] = ['in', 'low', 'out']

type SearchParams = Record<string, string | string[] | undefined>

const one = (v: string | string[] | undefined): string | undefined => (typeof v === 'string' ? v : undefined)
const posInt = (v: string | undefined): number | undefined => {
  if (v === undefined || !/^\d+$/.test(v.trim())) return undefined
  const n = Number(v)
  return Number.isSafeInteger(n) && n > 0 ? n : undefined
}
const nonNegInt = (v: string | undefined): number | undefined => {
  if (v === undefined || !/^\d+$/.test(v.trim())) return undefined
  const n = Number(v)
  return Number.isSafeInteger(n) ? n : undefined
}
const bool = (v: string | undefined): boolean | undefined => (v === '1' || v === 'true' ? true : v === '0' || v === 'false' ? false : undefined)

/** URL search params -> list params. Anything invalid is dropped (the default applies). */
export function parseListParams(sp: SearchParams): ProductListParams {
  const out: ProductListParams = {}
  const q = one(sp.q)?.trim()
  if (q) out.q = q.slice(0, 100)
  const categoryId = posInt(one(sp.categoryId))
  if (categoryId) out.categoryId = categoryId
  const brandId = posInt(one(sp.brandId))
  if (brandId) out.brandId = brandId
  const status = one(sp.status)
  if (status === 'DRAFT' || status === 'PUBLISHED') out.status = status
  const stock = one(sp.stock)
  if (stock && STOCK_STATES.includes(stock)) out.stock = stock as StockState
  const priceMin = nonNegInt(one(sp.priceMin))
  if (priceMin !== undefined) out.priceMin = priceMin
  const priceMax = nonNegInt(one(sp.priceMax))
  if (priceMax !== undefined) out.priceMax = priceMax
  const promo = bool(one(sp.promo))
  if (promo !== undefined) out.promo = promo
  if (bool(one(sp.incomplete)) === true) out.incomplete = true
  const sort = one(sp.sort)
  if (sort && (PRODUCT_SORTS as readonly string[]).includes(sort)) out.sort = sort as ProductSort
  const dir = one(sp.dir)
  if (dir === 'asc' || dir === 'desc') out.dir = dir
  const page = posInt(one(sp.page))
  if (page && page > 1) out.page = page
  return out
}

/** List params -> URL query (inverse of parseListParams; defaults omitted). */
export function listParamsToQuery(p: ProductListParams): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === '' || (k === 'page' && v === 1)) continue
    qs.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v))
  }
  return qs.toString()
}

const l10n = (v: unknown): L10n => (v && typeof v === 'object' && !Array.isArray(v) ? (v as L10n) : {})
const display = (v: unknown, fallback: string) => {
  const t = l10n(v)
  return t.en || t.uz || t.ru || fallback
}

/** Default direction per sort: text ascending, everything else newest/highest first. */
const defaultDir = (s: ProductSort): 'asc' | 'desc' => (s === 'title' ? 'asc' : 'desc')

/** Every product matching the filters, sorted (no paging). */
async function matching(p: ProductListParams): Promise<ProductRow[]> {
  const now = new Date()
  const [rows, settings, rules, ancestry] = await Promise.all([
    prisma.product.findMany({
      where: {
        ...(p.status ? { status: p.status } : {}),
        ...(p.brandId ? { brandId: p.brandId } : {}),
      },
      include: { variants: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }, category: true, brand: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    }),
    getSettings(),
    loadActiveRules(prisma, now),
    categoryAncestry(),
  ])
  const promoNames = new Map(
    (rules.length ? await prisma.promotion.findMany({ where: { id: { in: rules.map((r) => r.id) } }, select: { id: true, name: true } }) : []).map((r) => [r.id, r.name]),
  )
  const needle = p.q?.toLowerCase()

  const out: ProductRow[] = []
  for (const r of rows) {
    if (p.categoryId && !(ancestry.get(r.categoryId) ?? [r.categoryId]).includes(p.categoryId)) continue
    if (needle) {
      const titles = Object.values(l10n(r.title)).filter((x): x is string => typeof x === 'string')
      const hit = titles.some((t) => t.toLowerCase().includes(needle)) || r.variants.some((v) => v.sku.toLowerCase().includes(needle)) || r.slug.includes(needle)
      if (!hit) continue
    }
    const images = Array.isArray(r.images) ? r.images.filter((x): x is string => typeof x === 'string') : []
    const prices = r.variants.map((v) => v.priceUzs)
    const stocks = r.variants.map((v) => v.stock)
    const totalStock = stocks.reduce((a, b) => a + Math.max(0, b), 0)
    const minStock = stocks.length ? Math.min(...stocks) : 0
    const stockState: StockState = stocks.every((s) => s <= 0) ? 'out' : minStock <= settings.lowStockThreshold ? 'low' : 'in'
    const c = completeness(r)
    // The promotion that actually lowers a price (cheapest variant first), as the storefront would show it.
    let promo: string | null = null
    for (const v of [...r.variants].sort((a, b) => a.priceUzs - b.priceUzs)) {
      const best = bestPrice(priceTargetFor({ priceUzs: v.priceUzs, product: r }, ancestry), rules, now)
      if (best.promotionId !== null) {
        promo = promoNames.get(best.promotionId) ?? `#${best.promotionId}`
        break
      }
    }
    const row: ProductRow = {
      id: r.id,
      slug: r.slug,
      title: display(r.title, r.slug),
      status: r.status,
      isDemo: r.isDemo,
      image: images[0] ?? null,
      category: display(r.category.name, r.category.slug),
      brand: r.brand?.name ?? null,
      variants: r.variants.map((v) => ({ id: v.id, sku: v.sku, name: display(v.name, v.sku), priceUzs: v.priceUzs, stock: v.stock, colorHex: v.colorHex, image: variantThumb(images, v.imageIndex) })),
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
      totalStock,
      minStock,
      lowStock: stockState === 'low',
      stockState,
      completeness: c.score,
      missing: c.missing,
      promo,
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
    }
    if (p.stock === 'in' && row.stockState === 'out') continue
    if (p.stock && p.stock !== 'in' && row.stockState !== p.stock) continue
    if (p.priceMin !== undefined && (!r.variants.length || row.maxPrice < p.priceMin)) continue
    if (p.priceMax !== undefined && (!r.variants.length || row.minPrice > p.priceMax)) continue
    if (p.promo !== undefined && (row.promo !== null) !== p.promo) continue
    if (p.incomplete && row.completeness >= 100) continue
    out.push(row)
  }

  const sort = p.sort ?? 'updated'
  const sign = (p.dir ?? defaultDir(sort)) === 'asc' ? 1 : -1
  const key = (r: ProductRow): number | string => {
    switch (sort) {
      case 'title':
        return r.title.toLowerCase()
      case 'price':
        return r.minPrice
      case 'stock':
        return r.totalStock
      case 'created':
        return r.createdAt.getTime()
      default:
        return r.updatedAt.getTime()
    }
  }
  out.sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    const c = typeof ka === 'string' ? ka.localeCompare(kb as string) : ka - (kb as number)
    return c !== 0 ? sign * c : b.id - a.id
  })
  return out
}

/** One page (25) of the products matching the filters, plus the total match count. */
export async function queryProducts(p: ProductListParams): Promise<{ rows: ProductRow[]; total: number }> {
  const all = await matching(p)
  const pages = Math.max(1, Math.ceil(all.length / PRODUCTS_PAGE_SIZE))
  const page = Math.min(p.page ?? 1, pages)
  return { rows: all.slice((page - 1) * PRODUCTS_PAGE_SIZE, page * PRODUCTS_PAGE_SIZE), total: all.length }
}

// ---------- CSV ----------

const CSV_HEADER = ['id', 'slug', 'title (en)', 'brand', 'category', 'status', 'SKU', 'price (UZS)', 'stock']

/** Text that starts like a spreadsheet formula is defused with an apostrophe; quotes/separators are quoted. */
function cell(v: string): string {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** UTF-8 (with BOM, for Excel), `;`-separated, CRLF; one line per variant (a product without variants gets one line). Same filters and sort as the list, all pages. */
export async function productsCsv(p: ProductListParams): Promise<string> {
  const rows = await matching({ ...p, page: undefined })
  const ids = rows.map((r) => r.id)
  const titles = new Map((await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } })).map((r) => [r.id, l10n(r.title).en ?? '']))
  const lines = [CSV_HEADER.join(';')]
  for (const r of rows) {
    const base = [String(r.id), cell(r.slug), cell(titles.get(r.id) ?? ''), cell(r.brand ?? ''), cell(r.category), r.status]
    if (!r.variants.length) lines.push([...base, '', '', ''].join(';'))
    for (const v of r.variants) lines.push([...base, cell(v.sku), String(v.priceUzs), String(v.stock)].join(';'))
  }
  return `﻿${lines.join('\r\n')}\r\n`
}
