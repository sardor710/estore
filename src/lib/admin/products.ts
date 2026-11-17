import { prisma } from '@/lib/db'
import { sanitizeHtml } from '@/lib/sanitize'
import type { L10n } from '@/lib/localized'
import type { FaqItem, Highlight, Section, SpecGroup } from '@/lib/catalog'
import { SLUG_RE, STALE_PRODUCT, STALE_STOCK, checkPublishable, cleanL10n, isHttpUrl, type ActionResult, type EditBaseline, type ProductInput, type UpdateResult } from './products-shared'

export * from './products-shared'

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const HEX_RE = /^#[0-9a-fA-F]{6}$/

export async function publishProduct(id: number): Promise<ActionResult> {
  const p = await prisma.product.findUnique({ where: { id }, include: { variants: true } })
  if (!p) return { ok: false, error: 'Product not found.' }
  const reason = checkPublishable(p.variants)
  if (reason) return { ok: false, error: reason }
  const t = (p.title ?? {}) as L10n
  if (!Object.values(t).some((v) => typeof v === 'string' && v.trim())) return { ok: false, error: 'The product needs a title before publishing.' }
  await prisma.product.update({ where: { id }, data: { status: 'PUBLISHED' } })
  return { ok: true }
}

export async function unpublishProduct(id: number): Promise<ActionResult> {
  const r = await prisma.product.updateMany({ where: { id }, data: { status: 'DRAFT' } })
  return r.count === 1 ? { ok: true } : { ok: false, error: 'Product not found.' }
}

function cleanSections(v: unknown): Section[] {
  return (Array.isArray(v) ? v : []).map((s) => ({
    heading: cleanL10n(s?.heading),
    body: cleanL10n(s?.body),
    ...(typeof s?.image === 'string' && s.image ? { image: s.image } : {}),
  }))
}
function cleanHighlights(v: unknown): Highlight[] {
  return (Array.isArray(v) ? v : []).map((h) => ({
    ...(typeof h?.icon === 'string' && h.icon ? { icon: h.icon } : {}),
    title: cleanL10n(h?.title),
    ...(typeof h?.value === 'string' && h.value ? { value: h.value } : {}),
  }))
}
function cleanSpecs(v: unknown): SpecGroup[] {
  return (Array.isArray(v) ? v : []).map((g) => ({
    group: str(g?.group).trim(),
    items: (Array.isArray(g?.items) ? g.items : []).map((i: Record<string, unknown>) => {
      const valueL10n = cleanL10n(i?.valueL10n)
      return { label: str(i?.label).trim(), value: str(i?.value), ...(Object.keys(valueL10n).length ? { valueL10n } : {}) }
    }),
  }))
}

/** The baseline an editor gets when it (re)loads a product. */
export async function baselineOf(id: number): Promise<EditBaseline> {
  const p = await prisma.product.findUnique({ where: { id }, select: { updatedAt: true, variants: { select: { id: true, stock: true } } } })
  return { updatedAt: p?.updatedAt.toISOString() ?? '', stock: Object.fromEntries((p?.variants ?? []).map((v) => [v.id, v.stock])) }
}

class Stale extends Error {}

function validBaseline(b: unknown): b is EditBaseline {
  return Boolean(b) && typeof (b as EditBaseline).updatedAt === 'string' && Boolean((b as EditBaseline).stock) && typeof (b as EditBaseline).stock === 'object'
}

export async function updateProduct(id: number, input: ProductInput, baseline: EditBaseline): Promise<UpdateResult> {
  const errors: Record<string, string> = {}
  const existing = await prisma.product.findUnique({ where: { id }, include: { variants: true } })
  if (!existing) return { ok: false, errors: { _: 'Product not found.' } }
  if (!validBaseline(baseline) || existing.updatedAt.toISOString() !== baseline.updatedAt) return { ok: false, errors: { _: STALE_PRODUCT } }
  const baseStock = (vid: number): number | undefined => {
    const s = (baseline.stock as Record<string, unknown>)[String(vid)]
    return isInt(s) ? s : undefined
  }
  if (existing.variants.some((v) => baseStock(v.id) !== v.stock)) return { ok: false, errors: { _: STALE_STOCK } }

  const slug = str(input.slug).trim()
  if (!SLUG_RE.test(slug)) errors.slug = 'Slug may contain only a-z, 0-9 and single dashes.'
  else if (await prisma.product.findFirst({ where: { slug, NOT: { id } }, select: { id: true } })) errors.slug = 'This slug is already used by another product.'

  if (!isInt(input.categoryId) || !(await prisma.category.findUnique({ where: { id: input.categoryId }, select: { id: true } }))) {
    errors.categoryId = 'Choose an existing category.'
  }
  if (input.brandId !== null && (!isInt(input.brandId) || !(await prisma.brand.findUnique({ where: { id: input.brandId }, select: { id: true } })))) {
    errors.brandId = 'Choose an existing brand (or none).'
  }
  if (input.templateOverride !== null && input.templateOverride !== 'SIMPLE' && input.templateOverride !== 'DETAILED') {
    errors.templateOverride = 'Template must be SIMPLE, DETAILED or inherited.'
  }

  const images = Array.isArray(input.images) ? input.images.map((s) => str(s).trim()).filter(Boolean) : []
  const badImage = images.find((u) => !isHttpUrl(u))
  if (badImage !== undefined) errors.images = `Only http(s) image URLs are allowed: ${badImage.slice(0, 80)}`

  // Variants
  const variants = Array.isArray(input.variants) ? input.variants : []
  const vErrors: string[] = []
  const skus = new Set<string>()
  variants.forEach((v, i) => {
    const n = `Variant ${i + 1}`
    const sku = str(v.sku).trim()
    if (!sku) vErrors.push(`${n}: SKU is required.`)
    else if (skus.has(sku.toLowerCase())) vErrors.push(`${n}: SKU ${sku} is used twice.`)
    skus.add(sku.toLowerCase())
    if (!isInt(v.priceUzs) || v.priceUzs < 0) vErrors.push(`${n}: price must be a whole number >= 0.`)
    if (v.compareAtUzs !== null && (!isInt(v.compareAtUzs) || v.compareAtUzs < 0)) vErrors.push(`${n}: compare-at must be empty or a whole number >= 0.`)
    if (!isInt(v.stock) || v.stock < 0) vErrors.push(`${n}: stock must be a whole number >= 0.`)
    if (v.colorHex !== null && !HEX_RE.test(str(v.colorHex))) vErrors.push(`${n}: color must look like #aabbcc.`)
    if (v.imageIndex !== null && (!isInt(v.imageIndex) || v.imageIndex < 0 || v.imageIndex >= images.length)) vErrors.push(`${n}: image index is out of range.`)
    if (v.id !== undefined && !existing.variants.some((e) => e.id === v.id)) vErrors.push(`${n}: unknown variant id.`)
  })
  if (vErrors.length === 0 && variants.length) {
    const clash = await prisma.variant.findMany({
      where: { sku: { in: variants.map((v) => v.sku.trim()) }, NOT: { productId: id } },
      select: { sku: true },
    })
    if (clash.length) vErrors.push(`SKU already used by another product: ${clash.map((c) => c.sku).join(', ')}.`)
  }
  // Removing a variant that an open order still references would break confirm/cancel stock handling.
  const keepIds = new Set(variants.filter((v) => v.id !== undefined).map((v) => v.id))
  const removed = existing.variants.filter((e) => !keepIds.has(e.id))
  if (removed.length) {
    const open = await prisma.orderLine.findMany({
      where: { variantId: { in: removed.map((r) => r.id) }, order: { status: { in: ['NEW', 'CONFIRMED'] } } },
      select: { variantId: true },
    })
    for (const vid of new Set(open.map((o) => o.variantId))) {
      const sku = removed.find((r) => r.id === vid)?.sku
      vErrors.push(`Variant ${sku} is in an open order (NEW/CONFIRMED) and cannot be removed.`)
    }
  }
  // A live product must stay sellable: same gate as publishing (never silently unpublish).
  if (vErrors.length === 0 && existing.status === 'PUBLISHED') {
    const reason = checkPublishable(variants)
    if (reason) vErrors.push(reason)
  }
  if (vErrors.length) errors.variants = vErrors.join(' ')

  if (Object.keys(errors).length) return { ok: false, errors }

  const descriptionHtml: L10n = {}
  for (const [l, html] of Object.entries(cleanL10n(input.descriptionHtml))) {
    const clean = sanitizeHtml(html as string)
    if (clean) descriptionHtml[l as keyof L10n] = clean
  }

  const badge = typeof input.badge === 'string' && input.badge.trim() ? input.badge.trim() : null

  // The baseline checks above are re-done atomically here: anything that moved in between rolls the whole save back.
  const expectStock = (vid: number): number => {
    const s = baseStock(vid)
    if (s === undefined) throw new Stale(STALE_STOCK)
    return s
  }
  try {
    await prisma.$transaction(async (tx) => {
      const moved = await tx.product.updateMany({
        where: { id, updatedAt: new Date(baseline.updatedAt) },
        data: {
          slug,
          categoryId: input.categoryId,
          templateOverride: input.templateOverride,
          brandId: input.brandId,
          badge,
          title: cleanL10n(input.title),
          subtitle: cleanL10n(input.subtitle),
          shortSpec: cleanL10n(input.shortSpec),
          descriptionHtml,
          sections: cleanSections(input.sections),
          highlights: cleanHighlights(input.highlights),
          inTheBox: (Array.isArray(input.inTheBox) ? input.inTheBox : []).map(cleanL10n).filter((x) => Object.keys(x).length),
          faq: (Array.isArray(input.faq) ? input.faq : []).map((f) => ({ q: cleanL10n(f?.q), a: cleanL10n(f?.a) })),
          specs: cleanSpecs(input.specs),
          images,
          reviewed: { uz: input.reviewed?.uz === true, ru: input.reviewed?.ru === true },
          updatedAt: new Date(),
        },
      })
      if (moved.count !== 1) throw new Stale(STALE_PRODUCT)
      for (const r of removed) {
        const gone = await tx.variant.deleteMany({ where: { id: r.id, stock: expectStock(r.id) } })
        if (gone.count !== 1) throw new Stale(STALE_STOCK)
      }
      // SKUs may be swapped between variants of this product: park changed ones first to dodge the unique index.
      for (const [i, v] of variants.entries()) {
        if (v.id === undefined) continue
        const cur = existing.variants.find((e) => e.id === v.id)
        if (cur && cur.sku !== v.sku.trim()) await tx.variant.update({ where: { id: v.id }, data: { sku: `__tmp_${id}_${v.id}_${i}` } })
      }
      for (const [i, v] of variants.entries()) {
        const data = {
          sku: v.sku.trim(),
          name: cleanL10n(v.name),
          priceUzs: v.priceUzs,
          compareAtUzs: v.compareAtUzs,
          stock: v.stock,
          colorHex: v.colorHex,
          imageIndex: v.imageIndex,
          sortOrder: i,
        }
        if (v.id !== undefined) {
          // Absolute stock write only if nobody (e.g. an order confirm) changed it since the editor loaded.
          const w = await tx.variant.updateMany({ where: { id: v.id, productId: id, stock: baseStock(v.id) }, data })
          if (w.count !== 1) throw new Stale(STALE_STOCK)
        } else await tx.variant.create({ data: { ...data, productId: id } })
      }
    })
  } catch (e) {
    if (e instanceof Stale) return { ok: false, errors: { _: e.message } }
    throw e
  }
  return { ok: true }
}
