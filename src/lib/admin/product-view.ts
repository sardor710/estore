import { prisma } from '@/lib/db'
import type { L10n } from '@/lib/localized'
import type { FaqItem, Highlight, Section, SpecGroup } from '@/lib/catalog'
import { categoryAncestry } from '@/lib/promotions'
import type { ProductInput } from './products-shared'
import { promoState, toTashkentLocal } from './promotions'

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const l10n = (v: unknown): L10n => (v && typeof v === 'object' && !Array.isArray(v) ? (v as L10n) : {})

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
  slug: string; categoryId: number; templateOverride: string | null; brandId: number | null; badge: string | null
  title: unknown; subtitle: unknown; shortSpec: unknown; descriptionHtml: unknown; sections: unknown; highlights: unknown
  inTheBox: unknown; faq: unknown; specs: unknown; images: unknown; reviewed: unknown; seoTitle?: unknown; seoDescription?: unknown
  variants: { id: number; sku: string; name: unknown; priceUzs: number; compareAtUzs: number | null; stock: number; colorHex: string | null; imageIndex: number | null; sortOrder: number }[]
}): ProductInput {
  const rev = (p.reviewed && typeof p.reviewed === 'object' ? p.reviewed : {}) as { uz?: boolean; ru?: boolean }
  return {
    slug: p.slug,
    categoryId: p.categoryId,
    templateOverride: p.templateOverride === 'SIMPLE' || p.templateOverride === 'DETAILED' ? p.templateOverride : null,
    brandId: p.brandId,
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
    seoTitle: l10n(p.seoTitle),
    seoDescription: l10n(p.seoDescription),
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

export type ProductPromotion = { id: number; name: string; kind: string; value: number; via: 'product' | 'category' | 'brand'; state: 'active' | 'scheduled'; startsAt: string | null; endsAt: string | null }

/** Active and upcoming promotions that target this product directly, through its category tree or its brand (read-only editor tab). */
export async function productPromotions(productId: number, now: Date = new Date()): Promise<ProductPromotion[]> {
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { categoryId: true, brandId: true } })
  if (!p) return []
  const [rows, ancestry] = await Promise.all([prisma.promotion.findMany({ where: { enabled: true }, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }] }), categoryAncestry()])
  const categoryIds = ancestry.get(p.categoryId) ?? [p.categoryId]
  const out: ProductPromotion[] = []
  for (const r of rows) {
    const state = promoState(r, now)
    if (state !== 'active' && state !== 'scheduled') continue
    const ids = Array.isArray(r.targetIds) ? r.targetIds.filter((x): x is number => Number.isInteger(x)) : []
    const via =
      r.targetType === 'PRODUCT' && ids.includes(productId) ? 'product'
      : r.targetType === 'CATEGORY' && categoryIds.some((c) => ids.includes(c)) ? 'category'
      : r.targetType === 'BRAND' && p.brandId !== null && ids.includes(p.brandId) ? 'brand'
      : null
    if (via) out.push({ id: r.id, name: r.name, kind: r.kind, value: r.value, via, state, startsAt: toTashkentLocal(r.startsAt), endsAt: toTashkentLocal(r.endsAt) })
  }
  return out
}
