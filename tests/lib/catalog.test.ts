import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import {
  resolveTemplate,
  getNavCategories,
  getCategoryPage,
  getProductBySlug,
  searchProducts,
  getSaleProducts,
  getRelated,
  getNewArrivals,
} from '@/lib/catalog'

async function mkCat(slug: string, opts: { template?: string; parentId?: number; sortOrder?: number } = {}) {
  return prisma.category.create({
    data: {
      slug,
      template: opts.template ?? 'DETAILED',
      parentId: opts.parentId ?? null,
      sortOrder: opts.sortOrder ?? 0,
      name: { en: slug },
    },
  })
}

type V = { sku: string; priceUzs: number; compareAtUzs?: number | null; stock?: number }
async function mkProduct(o: {
  slug: string
  categoryId: number
  status?: string
  title?: Record<string, string>
  shortSpec?: Record<string, string>
  variants?: V[]
}) {
  return prisma.product.create({
    data: {
      slug: o.slug,
      categoryId: o.categoryId,
      status: o.status ?? 'PUBLISHED',
      title: o.title ?? { en: o.slug },
      subtitle: {},
      shortSpec: o.shortSpec ?? {},
      descriptionHtml: {},
      sections: [],
      highlights: [],
      inTheBox: [],
      faq: [],
      specs: [],
      images: [],
      reviewed: { uz: false, ru: false },
      variants: {
        create: (o.variants ?? [{ sku: `${o.slug}-1`, priceUzs: 100000 }]).map((v, i) => ({
          sku: v.sku,
          name: { en: v.sku },
          priceUzs: v.priceUzs,
          compareAtUzs: v.compareAtUzs ?? null,
          stock: v.stock ?? 5,
          sortOrder: i,
        })),
      },
    },
  })
}

describe('resolveTemplate', () => {
  it('uses the category template when there is no override', () => {
    expect(resolveTemplate({ templateOverride: null }, { template: 'DETAILED' })).toBe('DETAILED')
    expect(resolveTemplate({ templateOverride: null }, { template: 'SIMPLE' })).toBe('SIMPLE')
  })
  it('override wins', () => {
    expect(resolveTemplate({ templateOverride: 'SIMPLE' }, { template: 'DETAILED' })).toBe('SIMPLE')
    expect(resolveTemplate({ templateOverride: 'DETAILED' }, { template: 'SIMPLE' })).toBe('DETAILED')
  })
  it('ignores unknown override values', () => {
    expect(resolveTemplate({ templateOverride: 'weird' }, { template: 'DETAILED' })).toBe('DETAILED')
  })
})

describe('getProductBySlug', () => {
  it('hides DRAFT unless includeDraft', async () => {
    const c = await mkCat('chargers')
    await mkProduct({ slug: 'draft-one', categoryId: c.id, status: 'DRAFT' })
    expect(await getProductBySlug('draft-one')).toBeNull()
    const p = await getProductBySlug('draft-one', { includeDraft: true })
    expect(p?.slug).toBe('draft-one')
  })
  it('returns published product with variants, resolved template and spec labels', async () => {
    const c = await mkCat('chargers', { template: 'DETAILED' })
    const prod = await mkProduct({
      slug: 'pub',
      categoryId: c.id,
      variants: [
        { sku: 'A', priceUzs: 5 },
        { sku: 'B', priceUzs: 9 },
      ],
    })
    await prisma.product.update({
      where: { id: prod.id },
      data: { specs: [{ group: 'power', items: [{ label: 'wattage', value: '65W' }] }] },
    })
    await prisma.specLabel.create({ data: { key: 'power', label: { en: 'Power' } } })
    await prisma.specLabel.create({ data: { key: 'wattage', label: { en: 'Wattage' } } })
    const p = await getProductBySlug('pub')
    expect(p?.template).toBe('DETAILED')
    expect(p?.variants.map((v) => v.sku)).toEqual(['A', 'B'])
    expect(p?.specLabels.power).toEqual({ en: 'Power' })
    expect(p?.specLabels.wattage).toEqual({ en: 'Wattage' })
  })
})

describe('searchProducts', () => {
  it('finds by SKU, case-insensitive', async () => {
    const c = await mkCat('chargers')
    await mkProduct({ slug: 'a120', categoryId: c.id, variants: [{ sku: 'B120FJZ1', priceUzs: 1 }] })
    const hit = await searchProducts('B120FJZ1', 'uz')
    expect(hit.map((p) => p.slug)).toEqual(['a120'])
    expect((await searchProducts('b120fjz', 'en')).map((p) => p.slug)).toEqual(['a120'])
  })
  it('finds by uz title and by shortSpec of any locale', async () => {
    const c = await mkCat('chargers')
    await mkProduct({ slug: 'z', categoryId: c.id, title: { en: 'Charger', uz: 'Zaryad qurilmasi' } })
    await mkProduct({ slug: 's', categoryId: c.id, title: { en: 'Other' }, shortSpec: { ru: 'Быстрая зарядка' } })
    expect((await searchProducts('zaryad', 'uz')).map((p) => p.slug)).toEqual(['z'])
    expect((await searchProducts('быстрая', 'en')).map((p) => p.slug)).toEqual(['s'])
  })
  it('hides drafts and returns [] for blank query', async () => {
    const c = await mkCat('chargers')
    await mkProduct({ slug: 'd', categoryId: c.id, status: 'DRAFT', title: { en: 'Hidden gem' } })
    expect(await searchProducts('hidden', 'en')).toEqual([])
    expect(await searchProducts('   ', 'en')).toEqual([])
  })
})

describe('getSaleProducts', () => {
  it('returns only products with a discounted variant', async () => {
    const c = await mkCat('chargers')
    await mkProduct({ slug: 'on-sale', categoryId: c.id, variants: [{ sku: 'S1', priceUzs: 100, compareAtUzs: 150 }] })
    await mkProduct({ slug: 'equal', categoryId: c.id, variants: [{ sku: 'S2', priceUzs: 100, compareAtUzs: 100 }] })
    await mkProduct({ slug: 'lower', categoryId: c.id, variants: [{ sku: 'S3', priceUzs: 100, compareAtUzs: 50 }] })
    await mkProduct({ slug: 'none', categoryId: c.id, variants: [{ sku: 'S4', priceUzs: 100 }] })
    await mkProduct({
      slug: 'draft-sale',
      categoryId: c.id,
      status: 'DRAFT',
      variants: [{ sku: 'S5', priceUzs: 100, compareAtUzs: 150 }],
    })
    expect((await getSaleProducts()).map((p) => p.slug)).toEqual(['on-sale'])
  })
})

describe('card shape', () => {
  it('uses min variant price and its compare-at, and flags stock', async () => {
    const c = await mkCat('chargers')
    await mkProduct({
      slug: 'multi',
      categoryId: c.id,
      variants: [
        { sku: 'M1', priceUzs: 200, stock: 0 },
        { sku: 'M2', priceUzs: 100, compareAtUzs: 130, stock: 3 },
      ],
    })
    const [card] = await getSaleProducts()
    expect(card.minPriceUzs).toBe(100)
    expect(card.compareAtUzs).toBe(130)
    expect(card.inStock).toBe(true)
    expect(card.quickAddVariantId).not.toBeNull()
    await prisma.variant.updateMany({ data: { stock: 0 } })
    const [oos] = await getSaleProducts()
    expect(oos.inStock).toBe(false)
    expect(oos.quickAddVariantId).toBeNull()
  })
})

describe('categories', () => {
  it('builds a sorted tree', async () => {
    await mkCat('b', { sortOrder: 2 })
    const a = await mkCat('a', { sortOrder: 1 })
    await mkCat('a2', { parentId: a.id, sortOrder: 2 })
    await mkCat('a1', { parentId: a.id, sortOrder: 1 })
    const tree = await getNavCategories()
    expect(tree.map((n) => n.slug)).toEqual(['a', 'b'])
    expect(tree[0].children.map((n) => n.slug)).toEqual(['a1', 'a2'])
  })
  it('getCategoryPage includes descendants, hides drafts, sorts', async () => {
    const audio = await mkCat('audio')
    const buds = await mkCat('earbuds', { parentId: audio.id })
    await mkProduct({ slug: 'cheap', categoryId: buds.id, variants: [{ sku: 'C1', priceUzs: 10 }] })
    await mkProduct({ slug: 'pricey', categoryId: audio.id, variants: [{ sku: 'C2', priceUzs: 90 }] })
    await mkProduct({ slug: 'hidden', categoryId: buds.id, status: 'DRAFT' })
    const asc = await getCategoryPage('audio', { sort: 'price-asc' })
    expect(asc?.products.map((p) => p.slug)).toEqual(['cheap', 'pricey'])
    const desc = await getCategoryPage('audio', { sort: 'price-desc' })
    expect(desc?.products.map((p) => p.slug)).toEqual(['pricey', 'cheap'])
    expect(asc?.category.children.map((c) => c.slug)).toEqual(['earbuds'])
    expect(await getCategoryPage('nope')).toBeNull()
    const leaf = await getCategoryPage('earbuds')
    expect(leaf?.parent?.slug).toBe('audio')
    expect(leaf?.products.map((p) => p.slug)).toEqual(['cheap'])
  })
})

describe('related / new arrivals', () => {
  it('related prefers same category, excludes self and drafts, respects limit', async () => {
    const a = await mkCat('a')
    const b = await mkCat('b')
    const main = await mkProduct({ slug: 'main', categoryId: a.id })
    await mkProduct({ slug: 'same1', categoryId: a.id })
    await mkProduct({ slug: 'same-draft', categoryId: a.id, status: 'DRAFT' })
    await mkProduct({ slug: 'other', categoryId: b.id })
    const rel = await getRelated(main.id, 4)
    expect(rel.map((p) => p.slug)).toEqual(['same1', 'other'])
    expect(await getRelated(main.id, 1)).toHaveLength(1)
  })
  it('new arrivals are newest first', async () => {
    const a = await mkCat('a')
    await mkProduct({ slug: 'old', categoryId: a.id })
    await new Promise((r) => setTimeout(r, 5))
    await mkProduct({ slug: 'new', categoryId: a.id })
    expect((await getNewArrivals(8)).map((p) => p.slug)).toEqual(['new', 'old'])
  })
})
