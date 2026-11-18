// Admin SEO tool: audit every product's search-engine texts and fill/rewrite them automatically (src/lib/seo-auto.ts).

import { prisma } from '@/lib/db'
import { locales } from '@/i18n/routing'
import { t as l10n, type L10n } from '@/lib/localized'
import { autoSeo, seoIssues, type SeoFields, type SeoIssue, type SeoSource } from '@/lib/seo-auto'
import { cleanL10n } from './products-shared'

const SOURCE_SELECT = {
  id: true,
  slug: true,
  status: true,
  title: true,
  shortSpec: true,
  descriptionHtml: true,
  seoTitle: true,
  seoDescription: true,
  brand: { select: { name: true } },
  category: { select: { name: true } },
} as const

type Row = {
  title: unknown
  shortSpec: unknown
  descriptionHtml: unknown
  seoTitle: unknown
  seoDescription: unknown
  brand: { name: string } | null
  category: { name: unknown } | null
}

function sourceOf(p: Row): SeoSource {
  return {
    title: cleanL10n(p.title),
    shortSpec: cleanL10n(p.shortSpec),
    descriptionHtml: cleanL10n(p.descriptionHtml),
    brand: p.brand?.name ?? null,
    category: p.category ? cleanL10n(p.category.name) : null,
  }
}
const currentOf = (p: Pick<Row, 'seoTitle' | 'seoDescription'>): SeoFields => ({ seoTitle: cleanL10n(p.seoTitle), seoDescription: cleanL10n(p.seoDescription) })

const same = (a: L10n, b: L10n) => locales.every((l) => (a[l] ?? '') === (b[l] ?? ''))

/** SEO texts generated from an unsaved editor draft (the editor fills them in; staff save as usual). */
export async function suggestSeo(
  draft: { title: unknown; shortSpec: unknown; descriptionHtml: unknown; brandId: unknown; categoryId: unknown; seoTitle: unknown; seoDescription: unknown },
  onlyEmpty: boolean,
): Promise<SeoFields> {
  const [brand, category] = await Promise.all([
    Number.isInteger(draft.brandId) ? prisma.brand.findUnique({ where: { id: draft.brandId as number }, select: { name: true } }) : null,
    Number.isInteger(draft.categoryId) ? prisma.category.findUnique({ where: { id: draft.categoryId as number }, select: { name: true } }) : null,
  ])
  return autoSeo(sourceOf({ ...draft, brand, category }), currentOf(draft), { onlyEmpty })
}

/**
 * Writes generated SEO texts for one product. `overwrite: false` fills only blank fields (what publishing does).
 * Returns whether anything changed.
 */
export async function autoFillProductSeo(id: number, opts: { overwrite?: boolean } = {}): Promise<boolean> {
  const p = await prisma.product.findUnique({ where: { id }, select: SOURCE_SELECT })
  if (!p) return false
  const cur = currentOf(p)
  const next = autoSeo(sourceOf(p), cur, { onlyEmpty: !opts.overwrite })
  if (same(cur.seoTitle, next.seoTitle) && same(cur.seoDescription, next.seoDescription)) return false
  await prisma.product.update({ where: { id }, data: { seoTitle: next.seoTitle, seoDescription: next.seoDescription } })
  return true
}

export type SeoAuditRow = {
  id: number
  slug: string
  status: string
  name: string
  seoTitle: L10n
  seoDescription: L10n
  issues: SeoIssue[]
}

/** Every product with its SEO problems; products with problems first. */
export async function seoAudit(): Promise<SeoAuditRow[]> {
  const list = await prisma.product.findMany({ select: SOURCE_SELECT, orderBy: { id: 'desc' } })
  const rows = list.map((p) => {
    const cur = currentOf(p)
    return { id: p.id, slug: p.slug, status: p.status, name: l10n(cleanL10n(p.title), 'en'), ...cur, issues: seoIssues(cur) }
  })
  return rows.sort((a, b) => Number(b.issues.length > 0) - Number(a.issues.length > 0))
}

/** Fills (or with `overwrite`, rewrites) SEO for the given products, or all of them. Returns how many changed. */
export async function autoFillAllSeo(opts: { overwrite?: boolean; ids?: number[] } = {}): Promise<number> {
  const ids = opts.ids ?? (await prisma.product.findMany({ select: { id: true } })).map((p) => p.id)
  let changed = 0
  for (const id of ids) if (await autoFillProductSeo(id, opts)) changed++
  return changed
}
