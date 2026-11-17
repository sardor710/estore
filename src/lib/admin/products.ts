import { prisma } from '@/lib/db'
import { sanitizeHtml } from '@/lib/sanitize'
import type { Prisma } from '@/generated/prisma/client'
import { logActivity } from './activity'
import { loadPromotionInput, savePromotion, type PromotionInput } from './promotions'
import type { Staff } from './session'
import type { L10n } from '@/lib/localized'
import type { FaqItem, Highlight, Section, SpecGroup } from '@/lib/catalog'
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, SLUG_RE, STALE_PRODUCT, STALE_STOCK, checkPublishable, cleanL10n, isProductImageUrl, type ActionResult, type BulkActionInput, type BulkResult, type EditBaseline, type ProductInput, type UpdateResult } from './products-shared'

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
  const badImage = images.find((u) => !isProductImageUrl(u))
  if (badImage !== undefined) errors.images = `Only http(s) image URLs or uploaded images are allowed: ${badImage.slice(0, 80)}`

  const seoTitle = cleanL10n(input.seoTitle)
  const seoDescription = cleanL10n(input.seoDescription)
  const seoErrors: string[] = []
  for (const [l, v] of Object.entries(seoTitle)) if (v.length > SEO_TITLE_MAX) seoErrors.push(`SEO title (${l}) is longer than ${SEO_TITLE_MAX} characters.`)
  for (const [l, v] of Object.entries(seoDescription)) if (v.length > SEO_DESCRIPTION_MAX) seoErrors.push(`SEO description (${l}) is longer than ${SEO_DESCRIPTION_MAX} characters.`)
  if (seoErrors.length) errors.seo = seoErrors.join(' ')

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
          seoTitle,
          seoDescription,
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

// ---------- workspace tools (bulk actions, inline variant edit, duplicate) ----------

const BULK_TYPES: readonly string[] = ['publish', 'unpublish', 'delete', 'setCategory', 'setBrand', 'addToPromotion']
const MAX_BULK = 500

/** True when any variant of the product is in a NEW/CONFIRMED order (deleting it would break stock handling). */
async function inOpenOrder(tx: Prisma.TransactionClient, productId: number): Promise<boolean> {
  const variants = await tx.variant.findMany({ where: { productId }, select: { id: true } })
  if (!variants.length) return false
  const n = await tx.orderLine.count({ where: { variantId: { in: variants.map((v) => v.id) }, order: { status: { in: ['NEW', 'CONFIRMED'] } } } })
  return n > 0
}

class InOpenOrder extends Error {}

/**
 * Deletes a product and, in the same transaction, drops its id from every PRODUCT promotion (a stale id would
 * make the promotion unsaveable). A promotion left without targets is switched off. Returns the promotions
 * changed, or null when a variant is in an open order (nothing deleted).
 */
async function deleteProductEverywhere(id: number): Promise<{ id: number; name: string; disabled: boolean }[] | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      if (await inOpenOrder(tx, id)) throw new InOpenOrder()
      await tx.product.delete({ where: { id } })
      const changed: { id: number; name: string; disabled: boolean }[] = []
      for (const promo of await tx.promotion.findMany({ where: { targetType: 'PRODUCT' } })) {
        const ids = Array.isArray(promo.targetIds) ? promo.targetIds : []
        if (!ids.includes(id)) continue
        const rest = ids.filter((x) => x !== id)
        const disabled = rest.length === 0 && promo.enabled
        await tx.promotion.update({ where: { id: promo.id }, data: { targetIds: rest, ...(rest.length === 0 ? { enabled: false } : {}) } })
        changed.push({ id: promo.id, name: promo.name, disabled })
      }
      return changed
    })
  } catch (e) {
    if (e instanceof InOpenOrder) return null
    throw e
  }
}

/**
 * Applies one action to many products, one at a time, logging each product that changed. Products the
 * action cannot apply to are reported in `skipped` with the reason (e.g. the publish gate) instead of failing the batch.
 */
export async function bulkAction(ids: number[], a: BulkActionInput, actor: Staff): Promise<BulkResult> {
  const list = [...new Set(Array.isArray(ids) ? ids : [])].filter(isInt).slice(0, MAX_BULK)
  const out: BulkResult = { done: 0, skipped: [] }
  const skipAll = (reason: string): BulkResult => ({ done: 0, skipped: list.map((id) => ({ id, reason })) })
  if (!a || !BULK_TYPES.includes(a.type)) return skipAll('Unknown bulk action.')

  // Resolve the action's target once.
  let label = ''
  let categoryId = 0
  if (a.type === 'setCategory') {
    const c = isInt(a.value) ? await prisma.category.findUnique({ where: { id: a.value }, select: { id: true, slug: true } }) : null
    if (!c) return skipAll('Choose an existing category.')
    categoryId = c.id
    label = c.slug
  }
  let brandId: number | null = null
  if (a.type === 'setBrand') {
    if (a.value !== undefined && a.value !== null) {
      const b = isInt(a.value) ? await prisma.brand.findUnique({ where: { id: a.value }, select: { id: true, name: true } }) : null
      if (!b) return skipAll('Choose an existing brand (or none).')
      brandId = b.id
      label = b.name
    } else label = 'no brand'
  }
  let promo: PromotionInput | null = null
  if (a.type === 'addToPromotion') {
    promo = isInt(a.value) ? await loadPromotionInput(a.value) : null
    if (!promo || promo.targetType !== 'PRODUCT') return skipAll('Choose a promotion that targets individual products.')
  }

  const rows = await prisma.product.findMany({ where: { id: { in: list } }, select: { id: true, slug: true } })
  const slugOf = new Map(rows.map((r) => [r.id, r.slug]))
  const toPromo: number[] = []
  for (const id of list) {
    const slug = slugOf.get(id)
    if (slug === undefined) {
      out.skipped.push({ id, reason: 'Product not found.' })
      continue
    }
    let summary = ''
    let action = 'update'
    if (a.type === 'publish' || a.type === 'unpublish') {
      const r = a.type === 'publish' ? await publishProduct(id) : await unpublishProduct(id)
      if (!r.ok) {
        out.skipped.push({ id, reason: r.error })
        continue
      }
      summary = `${a.type === 'publish' ? 'Published' : 'Unpublished'} product #${id} (bulk)`
    } else if (a.type === 'delete') {
      const promos = await deleteProductEverywhere(id)
      if (!promos) {
        out.skipped.push({ id, reason: 'A variant is in an open order (NEW/CONFIRMED); finish or cancel the order first.' })
        continue
      }
      for (const pr of promos) {
        await logActivity(actor, 'update', 'promotion', pr.id, `Removed deleted product #${id} from promotion "${pr.name}"${pr.disabled ? ' (no targets left: switched off)' : ''}`)
      }
      action = 'delete'
      summary = `Deleted product #${id} "${slug}" (bulk)`
    } else if (a.type === 'setCategory') {
      await prisma.product.update({ where: { id }, data: { categoryId } })
      summary = `Moved product #${id} to category "${label}" (bulk)`
    } else if (a.type === 'setBrand') {
      await prisma.product.update({ where: { id }, data: { brandId } })
      summary = `Set brand of product #${id} to ${label} (bulk)`
    } else {
      // addToPromotion: collected and written once below.
      if (promo!.targetIds.includes(id)) out.skipped.push({ id, reason: 'Already in this promotion.' })
      else toPromo.push(id)
      continue
    }
    await logActivity(actor, action, 'product', id, summary)
    out.done++
  }
  if (promo && toPromo.length) {
    // savePromotion validates the targets and logs the promotion change itself.
    const r = await savePromotion({ ...promo, targetIds: [...promo.targetIds, ...toPromo] }, actor)
    if (!r.ok) out.skipped.push(...toPromo.map((id) => ({ id, reason: r.error })))
    else out.done += toPromo.length
  }
  return out
}

export type InlineVariantResult = { ok: true; variant: { id: number; priceUzs: number; stock: number } } | { ok: false; error: string }

/** Price and/or stock of one variant from the product list (whole numbers >= 0). */
export async function updateVariantInline(variantId: number, patch: { priceUzs?: number; stock?: number }, actor: Staff): Promise<InlineVariantResult> {
  if (!isInt(variantId)) return { ok: false, error: 'Variant not found.' }
  const data: { priceUzs?: number; stock?: number } = {}
  for (const k of ['priceUzs', 'stock'] as const) {
    const v = patch?.[k]
    if (v === undefined) continue
    if (!isInt(v) || v < 0) return { ok: false, error: `${k === 'priceUzs' ? 'Price' : 'Stock'} must be a whole number >= 0.` }
    data[k] = v
  }
  if (!Object.keys(data).length) return { ok: false, error: 'Nothing to change.' }
  const cur = await prisma.variant.findUnique({ where: { id: variantId }, include: { product: { select: { id: true, status: true } } } })
  if (!cur) return { ok: false, error: 'Variant not found.' }
  if (cur.product.status === 'PUBLISHED' && data.priceUzs === 0) return { ok: false, error: 'This product is live: every variant needs a price above 0.' }
  const v = await prisma.$transaction(async (tx) => {
    const updated = await tx.variant.update({ where: { id: variantId }, data })
    // Bump the product so an editor opened before this change refuses to overwrite it.
    await tx.product.update({ where: { id: cur.product.id }, data: { updatedAt: new Date() } })
    return updated
  })
  const parts = [
    data.priceUzs !== undefined && data.priceUzs !== cur.priceUzs ? `price ${cur.priceUzs} -> ${data.priceUzs}` : null,
    data.stock !== undefined && data.stock !== cur.stock ? `stock ${cur.stock} -> ${data.stock}` : null,
  ].filter(Boolean)
  await logActivity(actor, 'update', 'product', cur.product.id, `Inline edit of ${cur.sku}: ${parts.join(', ') || 'no change'}`)
  return { ok: true, variant: { id: v.id, priceUzs: v.priceUzs, stock: v.stock } }
}

/** First free value of base, base-2, base-3, ... */
async function firstFree(base: string, taken: (candidate: string) => Promise<boolean>): Promise<string> {
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`
    if (!(await taken(candidate))) return candidate
  }
}

/** Copies a product as a DRAFT (`<slug>-copy[-n]`, SKUs `<sku>-COPY[-n]`, stock 0, not linked to an import source); returns the new id. */
export async function duplicateProduct(id: number, actor: Staff): Promise<number> {
  const src = await prisma.product.findUnique({ where: { id }, include: { variants: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } } })
  if (!src) throw new Error('Product not found.')
  const slug = await firstFree(`${src.slug}-copy`, async (s) => Boolean(await prisma.product.findUnique({ where: { slug: s }, select: { id: true } })))
  const skus: string[] = []
  for (const v of src.variants) {
    skus.push(await firstFree(`${v.sku}-COPY`, async (s) => skus.includes(s) || Boolean(await prisma.variant.findUnique({ where: { sku: s }, select: { id: true } }))))
  }
  // Json columns: copy the stored value; a NULL optional column stays unset.
  const j = (v: unknown) => v as Prisma.InputJsonValue
  const copy = await prisma.product.create({
    data: {
      slug,
      categoryId: src.categoryId,
      templateOverride: src.templateOverride,
      status: 'DRAFT',
      brandId: src.brandId,
      ...(src.seoTitle !== null ? { seoTitle: j(src.seoTitle) } : {}),
      ...(src.seoDescription !== null ? { seoDescription: j(src.seoDescription) } : {}),
      sourceUrl: null,
      sourcePriceUsd: null,
      title: j(src.title),
      subtitle: j(src.subtitle),
      shortSpec: j(src.shortSpec),
      descriptionHtml: j(src.descriptionHtml),
      sections: j(src.sections),
      highlights: j(src.highlights),
      inTheBox: j(src.inTheBox),
      faq: j(src.faq),
      specs: j(src.specs),
      images: j(src.images),
      badge: src.badge,
      reviewed: j(src.reviewed),
      isDemo: src.isDemo,
      variants: {
        create: src.variants.map((v, i) => ({
          sku: skus[i],
          name: j(v.name),
          colorHex: v.colorHex,
          imageIndex: v.imageIndex,
          priceUzs: v.priceUzs,
          compareAtUzs: v.compareAtUzs,
          stock: 0, // a copy is a new listing: it starts with no stock of its own
          sortOrder: v.sortOrder,
        })),
      },
    },
  })
  await logActivity(actor, 'create', 'product', copy.id, `Duplicated product #${id} as #${copy.id} "${slug}"`)
  return copy.id
}
