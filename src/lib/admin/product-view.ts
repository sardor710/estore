import { prisma } from '@/lib/db'
import type { L10n } from '@/lib/localized'
import type { FaqItem, Highlight, Section, SpecGroup } from '@/lib/catalog'
import type { ProductInput } from './products-shared'

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const l10n = (v: unknown): L10n => (v && typeof v === 'object' && !Array.isArray(v) ? (v as L10n) : {})
const text = (v: unknown, l: 'uz' | 'ru' | 'en') => {
  const x = l10n(v)[l]
  return typeof x === 'string' && x.trim() !== ''
}

export type EditorProduct = {
  id: number
  status: string
  isDemo: boolean
  sourceUrl: string | null
  updatedAt: string
  input: ProductInput
  /** SpecLabel dictionary entries for every group/item key used by this product. */
  labels: Record<string, L10n>
}

export function rowToInput(p: {
  slug: string; categoryId: number; templateOverride: string | null; brand: string; badge: string | null
  title: unknown; subtitle: unknown; shortSpec: unknown; descriptionHtml: unknown; sections: unknown; highlights: unknown
  inTheBox: unknown; faq: unknown; specs: unknown; images: unknown; reviewed: unknown
  variants: { id: number; sku: string; name: unknown; priceUzs: number; compareAtUzs: number | null; stock: number; colorHex: string | null; imageIndex: number | null; sortOrder: number }[]
}): ProductInput {
  const rev = (p.reviewed && typeof p.reviewed === 'object' ? p.reviewed : {}) as { uz?: boolean; ru?: boolean }
  return {
    slug: p.slug,
    categoryId: p.categoryId,
    templateOverride: p.templateOverride === 'SIMPLE' || p.templateOverride === 'DETAILED' ? p.templateOverride : null,
    brand: p.brand,
    badge: p.badge,
    title: l10n(p.title),
    subtitle: l10n(p.subtitle),
    shortSpec: l10n(p.shortSpec),
    descriptionHtml: l10n(p.descriptionHtml),
    sections: arr<Section>(p.sections),
    highlights: arr<Highlight>(p.highlights),
    inTheBox: arr<L10n>(p.inTheBox),
    faq: arr<FaqItem>(p.faq),
    specs: arr<SpecGroup>(p.specs),
    images: arr<string>(p.images),
    reviewed: { uz: rev.uz === true, ru: rev.ru === true },
    variants: [...p.variants]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map((v) => ({ id: v.id, sku: v.sku, name: l10n(v.name), priceUzs: v.priceUzs, compareAtUzs: v.compareAtUzs, stock: v.stock, colorHex: v.colorHex, imageIndex: v.imageIndex })),
  }
}

export async function loadEditorProduct(id: number): Promise<EditorProduct | null> {
  const p = await prisma.product.findUnique({ where: { id }, include: { variants: true } })
  if (!p) return null
  const input = rowToInput(p)
  const keys = new Set<string>()
  for (const g of input.specs) {
    if (g.group) keys.add(g.group)
    for (const i of g.items) if (i.label) keys.add(i.label)
  }
  const rows = keys.size ? await prisma.specLabel.findMany({ where: { key: { in: [...keys] } } }) : []
  const labels: Record<string, L10n> = {}
  for (const r of rows) labels[r.key] = l10n(r.label)
  return { id: p.id, status: p.status, isDemo: p.isDemo, sourceUrl: p.sourceUrl, updatedAt: p.updatedAt.toISOString(), input, labels }
}

export type ProductListRow = {
  id: number
  slug: string
  title: string
  status: string
  isDemo: boolean
  category: string
  variantCount: number
  minPrice: number
  missing: ('uz' | 'ru')[]
  reviewed: { uz: boolean; ru: boolean }
  image: string | null
}

export async function listProducts(): Promise<ProductListRow[]> {
  const rows = await prisma.product.findMany({ include: { variants: true, category: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] })
  return rows.map((p) => {
    const rev = (p.reviewed && typeof p.reviewed === 'object' ? p.reviewed : {}) as { uz?: boolean; ru?: boolean }
    const missing = (['uz', 'ru'] as const).filter((l) => !text(p.title, l))
    const t = l10n(p.title)
    const cat = l10n(p.category.name)
    return {
      id: p.id,
      slug: p.slug,
      title: t.en || t.uz || t.ru || p.slug,
      status: p.status,
      isDemo: p.isDemo,
      category: cat.en || cat.uz || p.category.slug,
      variantCount: p.variants.length,
      minPrice: p.variants.length ? Math.min(...p.variants.map((v) => v.priceUzs)) : 0,
      missing: [...missing],
      reviewed: { uz: rev.uz === true, ru: rev.ru === true },
      image: arr<string>(p.images)[0] ?? null,
    }
  })
}
