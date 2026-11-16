import { prisma } from '@/lib/db'
import { isSellable, storefrontWhere } from '@/lib/visibility'
import type { Locale } from '@/i18n/routing'
import { locales } from '@/i18n/routing'
import type { L10n } from '@/lib/localized'

export type TemplateKind = 'SIMPLE' | 'DETAILED'
export type SortKey = 'new' | 'price-asc' | 'price-desc'

export type SpecItem = { label: string; value: string; valueL10n?: L10n }
export type SpecGroup = { group: string; items: SpecItem[] }
export type Section = { heading: L10n; body: L10n; image?: string }
export type Highlight = { icon?: string; title: L10n; value?: string }
export type FaqItem = { q: L10n; a: L10n }

export type CategoryNode = {
  id: number
  slug: string
  name: L10n
  template: TemplateKind
  sortOrder: number
  children: CategoryNode[]
}

export type CardProduct = {
  id: number
  slug: string
  title: L10n
  shortSpec: L10n
  badge: string | null
  image: string | null
  minPriceUzs: number
  /** compare-at of the cheapest variant, only when it is a real discount */
  compareAtUzs: number | null
  hasMultiplePrices: boolean
  inStock: boolean
  /** Id of the first in-stock variant (cheapest first); null when sold out */
  quickAddVariantId: number | null
  createdAt: Date
}

export type VariantView = {
  id: number
  sku: string
  name: L10n
  colorHex: string | null
  imageIndex: number | null
  priceUzs: number
  compareAtUzs: number | null
  stock: number
}

export type ProductDetail = {
  id: number
  slug: string
  brand: string
  badge: string | null
  template: TemplateKind
  status: string
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
  category: { id: number; slug: string; name: L10n; parent: { slug: string; name: L10n } | null }
  variants: VariantView[]
  specLabels: Record<string, L10n>
}

export function resolveTemplate(p: { templateOverride: string | null }, c: { template: string }): TemplateKind {
  if (p.templateOverride === 'SIMPLE' || p.templateOverride === 'DETAILED') return p.templateOverride
  return c.template === 'SIMPLE' ? 'SIMPLE' : 'DETAILED'
}

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const asL10n = (v: unknown): L10n => (v && typeof v === 'object' && !Array.isArray(v) ? (v as L10n) : {})

type ProductWithVariants = {
  id: number
  slug: string
  title: unknown
  shortSpec: unknown
  badge: string | null
  images: unknown
  createdAt: Date
  variants: { id: number; priceUzs: number; compareAtUzs: number | null; stock: number; sortOrder: number }[]
}

function toCard(p: ProductWithVariants): CardProduct {
  const vs = [...p.variants].sort((a, b) => a.priceUzs - b.priceUzs || a.sortOrder - b.sortOrder)
  const cheapest = vs[0]
  const firstInStock = vs.find((v) => v.stock > 0)
  const images = asArray<string>(p.images)
  return {
    id: p.id,
    slug: p.slug,
    title: asL10n(p.title),
    shortSpec: asL10n(p.shortSpec),
    badge: p.badge,
    image: images[0] ?? null,
    minPriceUzs: cheapest?.priceUzs ?? 0,
    compareAtUzs: cheapest && cheapest.compareAtUzs != null && cheapest.compareAtUzs > cheapest.priceUzs ? cheapest.compareAtUzs : null,
    hasMultiplePrices: vs.some((v) => v.priceUzs !== cheapest?.priceUzs),
    inStock: Boolean(firstInStock),
    quickAddVariantId: firstInStock ? firstInStock.id : null,
    createdAt: p.createdAt,
  }
}

const cardInclude = { variants: true } as const

async function publishedCards(where: object = {}): Promise<CardProduct[]> {
  const rows = await prisma.product.findMany({
    where: { ...storefrontWhere(), ...where },
    include: cardInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  return rows.map(toCard)
}

// ---------- categories ----------

function buildTree(rows: { id: number; slug: string; parentId: number | null; template: string; sortOrder: number; name: unknown }[]): CategoryNode[] {
  const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  const nodes = new Map<number, CategoryNode>()
  for (const r of sorted) {
    nodes.set(r.id, {
      id: r.id,
      slug: r.slug,
      name: asL10n(r.name),
      template: r.template === 'SIMPLE' ? 'SIMPLE' : 'DETAILED',
      sortOrder: r.sortOrder,
      children: [],
    })
  }
  const roots: CategoryNode[] = []
  for (const r of sorted) {
    const node = nodes.get(r.id)!
    const parent = r.parentId != null ? nodes.get(r.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

export async function getNavCategories(): Promise<CategoryNode[]> {
  return buildTree(await prisma.category.findMany())
}

function findNode(nodes: CategoryNode[], slug: string): { node: CategoryNode; parent: CategoryNode | null } | null {
  for (const n of nodes) {
    if (n.slug === slug) return { node: n, parent: null }
    for (const c of n.children) {
      if (c.slug === slug) return { node: c, parent: n }
      const deeper = findNode(c.children, slug)
      if (deeper) return deeper
    }
  }
  return null
}

function collectIds(n: CategoryNode): number[] {
  return [n.id, ...n.children.flatMap(collectIds)]
}

export async function getCategoryPage(
  slug: string,
  opts: { sort?: SortKey } = {},
): Promise<{ category: CategoryNode; parent: CategoryNode | null; products: CardProduct[] } | null> {
  const tree = await getNavCategories()
  const found = findNode(tree, slug)
  if (!found) return null
  const products = await publishedCards({ categoryId: { in: collectIds(found.node) } })
  const sort = opts.sort ?? 'new'
  if (sort === 'price-asc') products.sort((a, b) => a.minPriceUzs - b.minPriceUzs || b.id - a.id)
  else if (sort === 'price-desc') products.sort((a, b) => b.minPriceUzs - a.minPriceUzs || b.id - a.id)
  return { category: found.node, parent: found.parent, products }
}

// ---------- products ----------

export async function getProductBySlug(
  slug: string,
  opts: { includeDraft?: boolean } = {},
): Promise<ProductDetail | null> {
  const row = await prisma.product.findUnique({
    where: { slug },
    include: { variants: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }, category: { include: { parent: true } } },
  })
  if (!row) return null
  if (!isSellable(row) && !opts.includeDraft) return null

  const specs = asArray<SpecGroup>(row.specs)
  const keys = new Set<string>()
  for (const g of specs) {
    keys.add(g.group)
    for (const i of asArray<SpecItem>(g.items)) keys.add(i.label)
  }
  const labelRows = keys.size ? await prisma.specLabel.findMany({ where: { key: { in: [...keys] } } }) : []
  const specLabels: Record<string, L10n> = {}
  for (const l of labelRows) specLabels[l.key] = asL10n(l.label)

  return {
    id: row.id,
    slug: row.slug,
    brand: row.brand,
    badge: row.badge,
    status: row.status,
    template: resolveTemplate(row, row.category),
    title: asL10n(row.title),
    subtitle: asL10n(row.subtitle),
    shortSpec: asL10n(row.shortSpec),
    descriptionHtml: asL10n(row.descriptionHtml),
    sections: asArray<Section>(row.sections),
    highlights: asArray<Highlight>(row.highlights),
    inTheBox: asArray<L10n>(row.inTheBox),
    faq: asArray<FaqItem>(row.faq),
    specs,
    images: asArray<string>(row.images),
    category: {
      id: row.category.id,
      slug: row.category.slug,
      name: asL10n(row.category.name),
      parent: row.category.parent ? { slug: row.category.parent.slug, name: asL10n(row.category.parent.name) } : null,
    },
    variants: row.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: asL10n(v.name),
      colorHex: v.colorHex,
      imageIndex: v.imageIndex,
      priceUzs: v.priceUzs,
      compareAtUzs: v.compareAtUzs,
      stock: v.stock,
    })),
    specLabels,
  }
}

export async function searchProducts(q: string, locale: Locale): Promise<CardProduct[]> {
  const needle = q.trim().toLowerCase()
  if (!needle) return []
  const rows = await prisma.product.findMany({
    where: storefrontWhere(),
    include: cardInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  const has = (field: unknown, l?: Locale) => {
    const f = asL10n(field)
    const vals = l ? [f[l]] : locales.map((x) => f[x])
    return vals.some((v) => typeof v === 'string' && v.toLowerCase().includes(needle))
  }
  const scored: { row: (typeof rows)[number]; score: number }[] = []
  for (const row of rows) {
    let score = 0
    if (has(row.title, locale) || has(row.shortSpec, locale)) score = 3
    else if (has(row.title) || has(row.shortSpec)) score = 2
    else if (row.variants.some((v) => v.sku.toLowerCase().includes(needle))) score = 1
    if (score) scored.push({ row, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => toCard(s.row))
}

export async function getSaleProducts(): Promise<CardProduct[]> {
  const rows = await prisma.product.findMany({
    where: { ...storefrontWhere(), variants: { some: { compareAtUzs: { not: null } } } },
    include: cardInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  return rows
    .filter((r) => r.variants.some((v) => v.compareAtUzs != null && v.compareAtUzs > v.priceUzs))
    .map(toCard)
}

export async function getNewArrivals(limit = 8): Promise<CardProduct[]> {
  const rows = await prisma.product.findMany({
    where: storefrontWhere(),
    include: cardInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  })
  return rows.map(toCard)
}

export async function getRelated(productId: number, limit = 4): Promise<CardProduct[]> {
  const self = await prisma.product.findUnique({ where: { id: productId }, select: { categoryId: true } })
  if (!self) return []
  const base = { ...storefrontWhere(), id: { not: productId } }
  const same = await prisma.product.findMany({
    where: { ...base, categoryId: self.categoryId },
    include: cardInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  })
  let rows = same
  if (rows.length < limit) {
    const others = await prisma.product.findMany({
      where: { ...base, categoryId: { not: self.categoryId } },
      include: cardInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit - rows.length,
    })
    rows = [...rows, ...others]
  }
  return rows.map(toCard)
}
