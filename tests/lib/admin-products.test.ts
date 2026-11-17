import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import { publishProduct, unpublishProduct, updateProduct as rawUpdate, checkPublishable, baselineOf, bulkAction, duplicateProduct, updateVariantInline, completeness, type ProductInput } from '@/lib/admin/products'
import type { Staff } from '@/lib/admin/session'

const actor: Staff = { id: 0, email: 'pm@test', name: 'PM', role: 'PRODUCT_MANAGER' }

// Most tests edit with a fresh baseline (what the editor would have just loaded).
const updateProduct = async (id: number, input: ProductInput) => rawUpdate(id, input, await baselineOf(id))

async function mk(slug: string, variants: { sku: string; price: number; stock?: number }[]) {
  const cat = (await prisma.category.findFirst()) ?? (await prisma.category.create({ data: { slug: 'c', name: { en: 'c' } } }))
  return prisma.product.create({
    data: {
      slug, categoryId: cat.id, title: { en: 'T' }, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [],
      inTheBox: [], faq: [], specs: [], images: ['https://img/a.jpg', 'https://img/b.jpg'], reviewed: { uz: false, ru: false },
      variants: { create: variants.map((v, i) => ({ sku: v.sku, name: { en: v.sku }, priceUzs: v.price, stock: v.stock ?? 0, sortOrder: i })) },
    },
    include: { variants: true },
  })
}

function inputOf(p: Awaited<ReturnType<typeof mk>>, patch: Partial<ProductInput> = {}): ProductInput {
  return {
    slug: p.slug, categoryId: p.categoryId, templateOverride: null, brandId: null, badge: null,
    title: { en: 'T' }, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [], inTheBox: [], faq: [], specs: [],
    images: ['https://img/a.jpg'], reviewed: { uz: false, ru: false }, seoTitle: {}, seoDescription: {},
    variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, name: { en: v.sku }, priceUzs: v.priceUzs, compareAtUzs: null, stock: v.stock, colorHex: null, imageIndex: null })),
    ...patch,
  }
}

describe('publish validation', () => {
  it('checkPublishable', () => {
    expect(checkPublishable([])).toMatch(/variant/i)
    expect(checkPublishable([{ priceUzs: 0 }])).toMatch(/price/i)
    expect(checkPublishable([{ priceUzs: 5 }, { priceUzs: -1 }])).toMatch(/price/i)
    expect(checkPublishable([{ priceUzs: 5 }])).toBeNull()
  })
  it('rejects a product without variants', async () => {
    const p = await mk('nov', [])
    expect((await publishProduct(p.id)).ok).toBe(false)
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('DRAFT')
  })
  it('rejects a zero-price variant', async () => {
    const p = await mk('zero', [{ sku: 'Z1', price: 100 }, { sku: 'Z2', price: 0 }])
    expect(await publishProduct(p.id)).toMatchObject({ ok: false })
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('DRAFT')
  })
  it('publishes and unpublishes a valid product', async () => {
    const p = await mk('ok', [{ sku: 'K1', price: 100 }])
    expect(await publishProduct(p.id)).toEqual({ ok: true })
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('PUBLISHED')
    expect(await unpublishProduct(p.id)).toEqual({ ok: true })
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('DRAFT')
  })
  it('unknown id', async () => {
    expect(await publishProduct(99999)).toMatchObject({ ok: false })
  })
})

describe('updateProduct', () => {
  it('sets and clears the brand by id; rejects an unknown brand', async () => {
    const p = await mk('br', [{ sku: 'BR1', price: 100 }])
    const brand = await prisma.brand.create({ data: { name: 'Anker', slug: 'anker' } })
    expect(await updateProduct(p.id, inputOf(p, { brandId: brand.id }))).toEqual({ ok: true })
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).brandId).toBe(brand.id)
    expect(await updateProduct(p.id, inputOf(p, { brandId: 424242 }))).toMatchObject({ ok: false, errors: { brandId: expect.any(String) } })
    expect(await updateProduct(p.id, inputOf(p, { brandId: null }))).toEqual({ ok: true })
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).brandId).toBeNull()
  })
  it('saves fields, sanitizes html, syncs variants (add/update/remove)', async () => {
    const p = await mk('a', [{ sku: 'A1', price: 100 }, { sku: 'A2', price: 200 }])
    const [v1] = p.variants
    const r = await updateProduct(p.id, inputOf(p, {
      title: { en: 'New', uz: 'Yangi' },
      descriptionHtml: { en: '<p>hi</p><script>alert(1)</script>' },
      reviewed: { uz: true, ru: false },
      variants: [
        { id: v1.id, sku: 'A1', name: { en: 'One' }, priceUzs: 150, compareAtUzs: 200, stock: 4, colorHex: '#aabbcc', imageIndex: 0 },
        { sku: 'A3', name: { en: 'Three' }, priceUzs: 300, compareAtUzs: null, stock: 1, colorHex: null, imageIndex: null },
      ],
    }))
    expect(r).toEqual({ ok: true })
    const db = await prisma.product.findUniqueOrThrow({ where: { id: p.id }, include: { variants: { orderBy: { sortOrder: 'asc' } } } })
    expect(db.title).toEqual({ en: 'New', uz: 'Yangi' })
    expect((db.descriptionHtml as { en: string }).en).toBe('<p>hi</p>')
    expect(db.reviewed).toEqual({ uz: true, ru: false })
    expect(db.variants.map((v) => v.sku)).toEqual(['A1', 'A3'])
    expect(db.variants[0]).toMatchObject({ priceUzs: 150, compareAtUzs: 200, stock: 4, colorHex: '#aabbcc', imageIndex: 0 })
  })
  it('rejects bad slug and duplicate slug', async () => {
    const a = await mk('a', [{ sku: 'A1', price: 1 }])
    await mk('b', [{ sku: 'B1', price: 1 }])
    expect(await updateProduct(a.id, inputOf(a, { slug: 'Bad Slug' }))).toMatchObject({ ok: false, errors: { slug: expect.any(String) } })
    expect(await updateProduct(a.id, inputOf(a, { slug: 'b' }))).toMatchObject({ ok: false, errors: { slug: expect.any(String) } })
    expect(await updateProduct(a.id, inputOf(a, { slug: 'a-renamed' }))).toEqual({ ok: true })
  })
  it('rejects duplicate SKU (other product and within payload) without writing', async () => {
    const a = await mk('a', [{ sku: 'A1', price: 1 }])
    await mk('b', [{ sku: 'B1', price: 1 }])
    const base = inputOf(a)
    const clash = await updateProduct(a.id, { ...base, title: { en: 'CHANGED' }, variants: [{ ...base.variants[0], sku: 'B1' }] })
    expect(clash).toMatchObject({ ok: false, errors: { variants: expect.any(String) } })
    const dup = await updateProduct(a.id, {
      ...base,
      variants: [base.variants[0], { sku: 'A1', name: {}, priceUzs: 1, compareAtUzs: null, stock: 0, colorHex: null, imageIndex: null }],
    })
    expect(dup).toMatchObject({ ok: false })
    expect((await prisma.product.findUniqueOrThrow({ where: { id: a.id } })).title).toEqual({ en: 'T' })
  })
  it('rejects non-http(s) image URLs', async () => {
    const a = await mk('a', [{ sku: 'A1', price: 1 }])
    for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', '//evil/x.png', 'ftp://x/y.png', 'not a url']) {
      expect(await updateProduct(a.id, inputOf(a, { images: [bad] }))).toMatchObject({ ok: false, errors: { images: expect.any(String) } })
    }
    expect(await updateProduct(a.id, inputOf(a, { images: ['https://cdn.example/a.jpg', 'http://x/b.png'] }))).toEqual({ ok: true })
  })
  it('rejects negative/float price and stock, bad color, bad imageIndex', async () => {
    const a = await mk('a', [{ sku: 'A1', price: 1 }])
    const v = inputOf(a).variants[0]
    for (const patch of [{ priceUzs: -1 }, { priceUzs: 1.5 }, { stock: -1 }, { stock: 2.5 }, { colorHex: 'red' }, { imageIndex: 9 }, { compareAtUzs: -5 }, { sku: ' ' }]) {
      expect(await updateProduct(a.id, inputOf(a, { variants: [{ ...v, ...patch }] }))).toMatchObject({ ok: false })
    }
  })
  it('rejects unknown category and bad template', async () => {
    const a = await mk('a', [{ sku: 'A1', price: 1 }])
    expect(await updateProduct(a.id, inputOf(a, { categoryId: 99999 }))).toMatchObject({ ok: false, errors: { categoryId: expect.any(String) } })
    expect(await updateProduct(a.id, inputOf(a, { templateOverride: 'WEIRD' as never }))).toMatchObject({ ok: false })
  })
  it('a variant in an order that is out for delivery (SHIPPING) cannot be removed', async () => {
    const a = await mk('s', [{ sku: 'S1', price: 1, stock: 5 }, { sku: 'S2', price: 1 }])
    await prisma.order.create({
      data: {
        number: 1002, status: 'SHIPPING', name: 'n', phone: 'p', region: 'r', address: 'a', locale: 'uz', totalUzs: 1,
        lines: { create: [{ variantId: a.variants[0].id, sku: 'S1', productTitle: 't', variantName: 'v', priceUzs: 1, qty: 1 }] },
      },
    })
    const r = await updateProduct(a.id, inputOf(a, { variants: [inputOf(a).variants[1]] }))
    expect(r).toMatchObject({ ok: false, errors: { variants: expect.stringContaining('S1') } })
  })

  it('refuses to delete a variant that is in an open order', async () => {
    const a = await mk('a', [{ sku: 'A1', price: 1, stock: 5 }, { sku: 'A2', price: 1 }])
    await prisma.order.create({
      data: {
        number: 1001, name: 'n', phone: 'p', region: 'r', address: 'a', locale: 'uz', totalUzs: 1,
        lines: { create: [{ variantId: a.variants[0].id, sku: 'A1', productTitle: 't', variantName: 'v', priceUzs: 1, qty: 1 }] },
      },
    })
    const r = await updateProduct(a.id, inputOf(a, { variants: [inputOf(a).variants[1]] }))
    expect(r).toMatchObject({ ok: false, errors: { variants: expect.stringContaining('A1') } })
  })
})

describe('published product keeps the publish gate on edit', () => {
  it('rejects a 0-price variant or no variants while PUBLISHED, DB unchanged', async () => {
    const p = await mk('pub', [{ sku: 'P1', price: 100 }])
    expect(await publishProduct(p.id)).toEqual({ ok: true })
    const v = inputOf(p).variants[0]
    const zero = await updateProduct(p.id, inputOf(p, { title: { en: 'CHANGED' }, variants: [{ ...v, priceUzs: 0 }] }))
    expect(zero).toMatchObject({ ok: false, errors: { variants: expect.stringMatching(/price/i) } })
    const none = await updateProduct(p.id, inputOf(p, { variants: [] }))
    expect(none).toMatchObject({ ok: false, errors: { variants: expect.stringMatching(/variant/i) } })
    const db = await prisma.product.findUniqueOrThrow({ where: { id: p.id }, include: { variants: true } })
    expect(db.title).toEqual({ en: 'T' })
    expect(db.status).toBe('PUBLISHED')
    expect(db.variants[0].priceUzs).toBe(100)
  })
  it('drafts may still be saved with 0 prices', async () => {
    const p = await mk('draft', [{ sku: 'D1', price: 0 }])
    expect(await updateProduct(p.id, inputOf(p))).toEqual({ ok: true })
  })
})

describe('optimistic concurrency (stale editor)', () => {
  it('rejects a save whose baseline stock is stale after an order confirm; stock stays', async () => {
    const { setOrderStatus } = await import('@/lib/orders')
    const p = await mk('conc', [{ sku: 'C1', price: 100, stock: 5 }])
    const base = await baselineOf(p.id) // editor opened: stock 5
    const order = await prisma.order.create({
      data: {
        number: 1001, name: 'n', phone: 'p', region: 'r', address: 'a', locale: 'uz', totalUzs: 200,
        lines: { create: [{ variantId: p.variants[0].id, sku: 'C1', productTitle: 't', variantName: 'v', priceUzs: 100, qty: 2 }] },
      },
    })
    expect(await setOrderStatus(order.id, 'CONFIRMED')).toEqual({ ok: true })
    const r = await rawUpdate(p.id, inputOf(p, { title: { en: 'Edited' } }), base) // still says stock 5
    expect(r).toMatchObject({ ok: false, errors: { _: expect.stringMatching(/stock changed.*reload/i) } })
    const db = await prisma.product.findUniqueOrThrow({ where: { id: p.id }, include: { variants: true } })
    expect(db.variants[0].stock).toBe(3)
    expect(db.title).toEqual({ en: 'T' }) // whole save rolled back
  })

  it('rejects a save after the product changed elsewhere (refresh added a variant); variant kept', async () => {
    const p = await mk('conc2', [{ sku: 'R1', price: 100, stock: 1 }])
    const base = await baselineOf(p.id)
    await new Promise((r) => setTimeout(r, 5))
    // what an importer refresh does: update the product and add a variant
    await prisma.product.update({ where: { id: p.id }, data: { images: ['https://img/a.jpg', 'https://img/b.jpg', 'https://img/c.jpg'] } })
    await prisma.variant.create({ data: { productId: p.id, sku: 'R2', name: { en: 'R2' }, priceUzs: 0, stock: 0, sortOrder: 1 } })
    const r = await rawUpdate(p.id, inputOf(p), base) // stale payload without R2
    expect(r).toMatchObject({ ok: false, errors: { _: expect.stringMatching(/changed since you opened it.*reload/i) } })
    const db = await prisma.product.findUniqueOrThrow({ where: { id: p.id }, include: { variants: true } })
    expect(db.variants.map((v) => v.sku).sort()).toEqual(['R1', 'R2'])
  })

  it('rejects a save without a baseline', async () => {
    const p = await mk('conc3', [{ sku: 'N1', price: 100 }])
    expect(await rawUpdate(p.id, inputOf(p), undefined as never)).toMatchObject({ ok: false, errors: { _: expect.any(String) } })
  })

  it('a normal save works and the next save needs the fresh baseline', async () => {
    const p = await mk('conc4', [{ sku: 'K1', price: 100, stock: 5 }])
    const base = await baselineOf(p.id)
    const v = inputOf(p).variants[0]
    expect(await rawUpdate(p.id, inputOf(p, { variants: [{ ...v, stock: 9 }] }), base)).toEqual({ ok: true })
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: v.id! } })).stock).toBe(9)
    // reusing the old baseline is now stale
    expect(await rawUpdate(p.id, inputOf(p, { variants: [{ ...v, stock: 1 }] }), base)).toMatchObject({ ok: false })
    const fresh = await baselineOf(p.id)
    expect(fresh.stock[v.id!]).toBe(9)
    expect(await rawUpdate(p.id, inputOf(p, { variants: [{ ...v, stock: 1 }] }), fresh)).toEqual({ ok: true })
  })
})

describe('SEO fields', () => {
  it('saves per-locale SEO title/description and enforces 70/160 characters', async () => {
    const p = await mk('seo', [{ sku: 'SEO1', price: 100 }])
    expect(await updateProduct(p.id, inputOf(p, { seoTitle: { en: 'Charger' }, seoDescription: { ru: 'Описание' } }))).toEqual({ ok: true })
    const db = await prisma.product.findUniqueOrThrow({ where: { id: p.id } })
    expect(db.seoTitle).toEqual({ en: 'Charger' })
    expect(db.seoDescription).toEqual({ ru: 'Описание' })
    expect(await updateProduct(p.id, inputOf(p, { seoTitle: { uz: 'x'.repeat(71) } }))).toMatchObject({ ok: false, errors: { seo: expect.stringMatching(/70/) } })
    expect(await updateProduct(p.id, inputOf(p, { seoDescription: { en: 'x'.repeat(161) } }))).toMatchObject({ ok: false, errors: { seo: expect.stringMatching(/160/) } })
  })
  it('accepts uploaded image paths next to http(s) URLs', async () => {
    const p = await mk('up', [{ sku: 'UP1', price: 100 }])
    expect(await updateProduct(p.id, inputOf(p, { images: ['/uploads/2026/11/0a1b2c3d.webp', 'https://img/a.jpg'] }))).toEqual({ ok: true })
    expect(await updateProduct(p.id, inputOf(p, { images: ['/uploads/../secret.png'] }))).toMatchObject({ ok: false, errors: { images: expect.any(String) } })
  })
})

describe('completeness', () => {
  const filled = {
    variants: [{ priceUzs: 100 }],
    images: ['https://img/a.jpg'],
    title: { uz: 'a', ru: 'b', en: 'c' },
    descriptionHtml: { uz: '<p>a</p>', ru: '<p>b</p>', en: '<p>c</p>' },
    reviewed: { uz: true, ru: true },
    specs: [{ group: 'g', items: [{ label: 'l', value: 'v' }] }],
    seoDescription: { uz: 'a', ru: 'b', en: 'c' },
  }
  it('a fully filled product scores 100 with nothing missing', () => {
    expect(completeness(filled)).toEqual({ score: 100, missing: [] })
  })
  it('each check has equal weight', () => {
    const r = completeness({ ...filled, images: [], reviewed: { uz: true, ru: false } })
    expect(r.score).toBe(67)
    expect(r.missing).toHaveLength(2)
    expect(completeness({ variants: [], images: [], title: {}, descriptionHtml: {}, reviewed: {}, specs: [], seoDescription: null }).score).toBe(0)
  })
})

describe('bulkAction', () => {
  it('publish skips a product with a 0 price and reports the reason', async () => {
    const ok = await mk('bulk-ok', [{ sku: 'BO1', price: 100 }])
    const zero = await mk('bulk-zero', [{ sku: 'BZ1', price: 0 }])
    const r = await bulkAction([ok.id, zero.id], { type: 'publish' }, actor)
    expect(r.done).toBe(1)
    expect(r.skipped).toEqual([{ id: zero.id, reason: expect.stringMatching(/price/i) }])
    expect((await prisma.product.findUniqueOrThrow({ where: { id: ok.id } })).status).toBe('PUBLISHED')
    expect((await prisma.product.findUniqueOrThrow({ where: { id: zero.id } })).status).toBe('DRAFT')
    expect(await prisma.activityLog.count({ where: { entity: 'product', entityId: String(ok.id) } })).toBe(1)
  })
  it('sets category and brand, adds to a PRODUCT promotion only, deletes', async () => {
    const a = await mk('bulk-a', [{ sku: 'BA1', price: 100 }])
    const b = await mk('bulk-b', [{ sku: 'BB1', price: 100 }])
    const cat = await prisma.category.create({ data: { slug: 'other', name: { en: 'Other' } } })
    const brand = await prisma.brand.create({ data: { name: 'Anker', slug: 'anker' } })
    expect(await bulkAction([a.id, b.id], { type: 'setCategory', value: cat.id }, actor)).toEqual({ done: 2, skipped: [] })
    expect(await bulkAction([a.id], { type: 'setBrand', value: brand.id }, actor)).toEqual({ done: 1, skipped: [] })
    const db = await prisma.product.findUniqueOrThrow({ where: { id: a.id } })
    expect(db).toMatchObject({ categoryId: cat.id, brandId: brand.id })
    expect((await bulkAction([a.id], { type: 'setCategory', value: 999999 }, actor)).done).toBe(0)

    const promo = await prisma.promotion.create({ data: { name: 'P', kind: 'PERCENT', value: 5, targetType: 'PRODUCT', targetIds: [a.id] } })
    const catPromo = await prisma.promotion.create({ data: { name: 'C', kind: 'PERCENT', value: 5, targetType: 'CATEGORY', targetIds: [cat.id] } })
    const add = await bulkAction([a.id, b.id], { type: 'addToPromotion', value: promo.id }, actor)
    expect(add.done).toBe(1)
    expect(add.skipped).toEqual([{ id: a.id, reason: expect.any(String) }])
    expect((await prisma.promotion.findUniqueOrThrow({ where: { id: promo.id } })).targetIds).toEqual([a.id, b.id])
    expect(await bulkAction([a.id], { type: 'addToPromotion', value: catPromo.id }, actor)).toMatchObject({ done: 0, skipped: [{ id: a.id }] })

    expect(await bulkAction([b.id], { type: 'delete' }, actor)).toEqual({ done: 1, skipped: [] })
    expect(await prisma.product.findUnique({ where: { id: b.id } })).toBeNull()
  })
  it('delete skips a product whose variant is in an open order', async () => {
    const a = await mk('bulk-open', [{ sku: 'OP1', price: 100, stock: 5 }])
    await prisma.order.create({
      data: {
        number: 2001, name: 'n', phone: 'p', region: 'r', address: 'a', locale: 'uz', totalUzs: 100,
        lines: { create: [{ variantId: a.variants[0].id, sku: 'OP1', productTitle: 't', variantName: 'v', priceUzs: 100, qty: 1 }] },
      },
    })
    expect(await bulkAction([a.id], { type: 'delete' }, actor)).toEqual({ done: 0, skipped: [{ id: a.id, reason: expect.stringMatching(/open order/i) }] })
    expect(await prisma.product.findUnique({ where: { id: a.id } })).not.toBeNull()
  })
})

describe('duplicateProduct', () => {
  it('twice -> x-copy, x-copy-2, DRAFT, unique SKUs, no sourceUrl', async () => {
    const src = await mk('x', [{ sku: 'X1', price: 100 }, { sku: 'X2', price: 200 }])
    await prisma.product.update({ where: { id: src.id }, data: { status: 'PUBLISHED', sourceUrl: 'https://anker.com/x', seoTitle: { en: 'S' } } })
    const id1 = await duplicateProduct(src.id, actor)
    const id2 = await duplicateProduct(src.id, actor)
    const [c1, c2] = await Promise.all(
      [id1, id2].map((id) => prisma.product.findUniqueOrThrow({ where: { id }, include: { variants: { orderBy: { sortOrder: 'asc' } } } })),
    )
    expect(c1).toMatchObject({ slug: 'x-copy', status: 'DRAFT', sourceUrl: null, seoTitle: { en: 'S' } })
    expect(c2).toMatchObject({ slug: 'x-copy-2', status: 'DRAFT', sourceUrl: null })
    expect(c1.variants.map((v) => v.sku)).toEqual(['X1-COPY', 'X2-COPY'])
    expect(c2.variants.map((v) => v.sku)).toEqual(['X1-COPY-2', 'X2-COPY-2'])
    expect(c1.variants.map((v) => v.priceUzs)).toEqual([100, 200])
    expect(await prisma.activityLog.count({ where: { entity: 'product', action: 'create' } })).toBe(2)
  })
})

describe('updateVariantInline', () => {
  it('rejects -1 and non-integers; saves valid price/stock and logs', async () => {
    const p = await mk('inline', [{ sku: 'IN1', price: 100, stock: 2 }])
    const v = p.variants[0]
    expect(await updateVariantInline(v.id, { stock: -1 }, actor)).toMatchObject({ ok: false })
    expect(await updateVariantInline(v.id, { priceUzs: 1.5 }, actor)).toMatchObject({ ok: false })
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: v.id } })).stock).toBe(2)
    expect(await updateVariantInline(v.id, { priceUzs: 250, stock: 7 }, actor)).toMatchObject({ ok: true })
    expect(await prisma.variant.findUniqueOrThrow({ where: { id: v.id } })).toMatchObject({ priceUzs: 250, stock: 7 })
    expect(await prisma.activityLog.count({ where: { entity: 'product', entityId: String(p.id) } })).toBe(1)
  })
  it('keeps a published product sellable (price 0 refused)', async () => {
    const p = await mk('inline-pub', [{ sku: 'IP1', price: 100 }])
    await publishProduct(p.id)
    expect(await updateVariantInline(p.variants[0].id, { priceUzs: 0 }, actor)).toMatchObject({ ok: false, error: expect.stringMatching(/price/i) })
  })
})

describe('productPromotions (editor tab)', () => {
  it('lists active and scheduled promos targeting the product, its category tree or its brand; not expired/off ones', async () => {
    const { productPromotions } = await import('@/lib/admin/product-view')
    const parent = await prisma.category.create({ data: { slug: 'audio', name: { en: 'Audio' } } })
    const p = await mk('pp', [{ sku: 'PP1', price: 100 }])
    await prisma.category.update({ where: { id: p.categoryId }, data: { parentId: parent.id } })
    const brand = await prisma.brand.create({ data: { name: 'Anker', slug: 'anker' } })
    await prisma.product.update({ where: { id: p.id }, data: { brandId: brand.id } })
    const day = 86_400_000
    await prisma.promotion.create({ data: { name: 'Tree', kind: 'PERCENT', value: 5, targetType: 'CATEGORY', targetIds: [parent.id] } })
    await prisma.promotion.create({ data: { name: 'Soon', kind: 'AMOUNT', value: 5000, targetType: 'PRODUCT', targetIds: [p.id], startsAt: new Date(Date.now() + day) } })
    await prisma.promotion.create({ data: { name: 'Brand', kind: 'PERCENT', value: 7, targetType: 'BRAND', targetIds: [brand.id] } })
    await prisma.promotion.create({ data: { name: 'Old', kind: 'PERCENT', value: 5, targetType: 'PRODUCT', targetIds: [p.id], endsAt: new Date(Date.now() - day) } })
    await prisma.promotion.create({ data: { name: 'Off', kind: 'PERCENT', value: 5, targetType: 'PRODUCT', targetIds: [p.id], enabled: false } })
    await prisma.promotion.create({ data: { name: 'Other', kind: 'PERCENT', value: 5, targetType: 'PRODUCT', targetIds: [p.id + 1000] } })
    const r = await productPromotions(p.id)
    expect(r.map((x) => [x.name, x.via, x.state]).sort()).toEqual([['Brand', 'brand', 'active'], ['Soon', 'product', 'scheduled'], ['Tree', 'category', 'active']])
  })
})

describe('bulk delete keeps PRODUCT promotions saveable', () => {
  it('removes the deleted id from promotions, disables a promotion left without targets, and logs it', async () => {
    const a = await mk('del-a', [{ sku: 'DA1', price: 100 }])
    const b = await mk('del-b', [{ sku: 'DB1', price: 100 }])
    const c = await mk('del-c', [{ sku: 'DC1', price: 100 }])
    const shared = await prisma.promotion.create({ data: { name: 'Shared', kind: 'PERCENT', value: 5, targetType: 'PRODUCT', targetIds: [a.id, b.id] } })
    const only = await prisma.promotion.create({ data: { name: 'Only', kind: 'PERCENT', value: 5, targetType: 'PRODUCT', targetIds: [a.id] } })
    expect(await bulkAction([a.id], { type: 'delete' }, actor)).toEqual({ done: 1, skipped: [] })
    expect((await prisma.promotion.findUniqueOrThrow({ where: { id: shared.id } })).targetIds).toEqual([b.id])
    expect(await prisma.promotion.findUniqueOrThrow({ where: { id: only.id } })).toMatchObject({ targetIds: [], enabled: false })
    expect(await prisma.activityLog.count({ where: { entity: 'promotion' } })).toBe(2)
    expect(await bulkAction([c.id], { type: 'addToPromotion', value: shared.id }, actor)).toEqual({ done: 1, skipped: [] })
    expect((await prisma.promotion.findUniqueOrThrow({ where: { id: shared.id } })).targetIds).toEqual([b.id, c.id])
  })
})

describe('updateVariantInline: stale baseline', () => {
  it('refuses a stock edit when the value changed since it was displayed; DB untouched', async () => {
    const p = await mk('inline-stale', [{ sku: 'ST1', price: 100, stock: 5 }])
    const v = p.variants[0]
    await prisma.variant.update({ where: { id: v.id }, data: { stock: 3 } }) // an order sold 2 meanwhile
    expect(await updateVariantInline(v.id, { stock: 9 }, actor, { stock: 5 })).toEqual({ ok: false, error: 'STALE' })
    expect((await prisma.variant.findUniqueOrThrow({ where: { id: v.id } })).stock).toBe(3)
    expect(await updateVariantInline(v.id, { stock: 9 }, actor, { stock: 3 })).toMatchObject({ ok: true, variant: { stock: 9 } })
  })
  it('guards price the same way', async () => {
    const p = await mk('inline-stale-price', [{ sku: 'ST2', price: 100 }])
    const id = p.variants[0].id
    expect(await updateVariantInline(id, { priceUzs: 200 }, actor, { priceUzs: 999 })).toEqual({ ok: false, error: 'STALE' })
    expect((await prisma.variant.findUniqueOrThrow({ where: { id } })).priceUzs).toBe(100)
  })
})
