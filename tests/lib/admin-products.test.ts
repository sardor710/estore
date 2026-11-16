import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import { publishProduct, unpublishProduct, updateProduct, checkPublishable, type ProductInput } from '@/lib/admin/products'

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
    slug: p.slug, categoryId: p.categoryId, templateOverride: null, brand: '', badge: null,
    title: { en: 'T' }, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [], inTheBox: [], faq: [], specs: [],
    images: ['https://img/a.jpg'], reviewed: { uz: false, ru: false },
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
