import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import { parseListParams, queryProducts } from '@/lib/admin/product-list'

let seq = 0
async function mk(slug: string, variants: { sku: string; price?: number; stock?: number }[], extra: Record<string, unknown> = {}) {
  const cat = (await prisma.category.findFirst()) ?? (await prisma.category.create({ data: { slug: 'c', name: { en: 'Chargers' } } }))
  return prisma.product.create({
    data: {
      slug, categoryId: cat.id, title: { en: `Title ${slug}` }, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [],
      inTheBox: [], faq: [], specs: [], images: [], reviewed: { uz: false, ru: false },
      ...extra,
      variants: { create: variants.map((v, i) => ({ sku: v.sku, name: { en: v.sku }, priceUzs: v.price ?? 100_000 + ++seq, stock: v.stock ?? 0, sortOrder: i })) },
    },
  })
}

const full = {
  title: { uz: 'Sarlavha', ru: 'Заголовок', en: 'Title' },
  descriptionHtml: { uz: '<p>uz</p>', ru: '<p>ru</p>', en: '<p>en</p>' },
  reviewed: { uz: true, ru: true },
  specs: [{ group: 'general', items: [{ label: 'power', value: '20W' }] }],
  images: ['https://img/a.jpg'],
  seoDescription: { uz: 'uz seo', ru: 'ru seo', en: 'en seo' },
}

describe('parseListParams', () => {
  it('drops invalid values (negative page, unknown sort)', () => {
    expect(parseListParams({ page: '-3', sort: 'bogus' })).toEqual({})
  })
  it('keeps valid values and coerces numbers/booleans', () => {
    expect(parseListParams({ q: ' anker ', categoryId: '4', status: 'DRAFT', stock: 'low', priceMin: '1000', promo: '1', incomplete: 'true', sort: 'price', dir: 'asc', page: '2' })).toEqual({
      q: 'anker', categoryId: 4, status: 'DRAFT', stock: 'low', priceMin: 1000, promo: true, incomplete: true, sort: 'price', dir: 'asc', page: 2,
    })
    expect(parseListParams({ status: 'LIVE', stock: 'many', brandId: 'x', priceMax: '-5', dir: 'up', q: ['a', 'b'] })).toEqual({})
  })
})

describe('queryProducts', () => {
  it("stock 'out' returns only products whose variants all have 0 stock", async () => {
    const out = await mk('all-out', [{ sku: 'O1', stock: 0 }, { sku: 'O2', stock: 0 }])
    await mk('mixed', [{ sku: 'M1', stock: 0 }, { sku: 'M2', stock: 5 }])
    await mk('in', [{ sku: 'I1', stock: 9 }])
    const r = await queryProducts({ stock: 'out' })
    expect(r.rows.map((p) => p.id)).toEqual([out.id])
    expect(r.total).toBe(1)
    expect(r.rows[0]).toMatchObject({ totalStock: 0 })
  })

  it('q matches a SKU (case-insensitive) and a title in any locale', async () => {
    const a = await mk('alpha', [{ sku: 'A2633-BLK' }])
    const b = await mk('beta', [{ sku: 'B1' }], { title: { en: 'Power bank', ru: 'Зарядное устройство' } })
    expect((await queryProducts({ q: 'a2633' })).rows.map((p) => p.id)).toEqual([a.id])
    expect((await queryProducts({ q: 'зарядное' })).rows.map((p) => p.id)).toEqual([b.id])
  })

  it('incomplete:true excludes a product with a 100 completeness score', async () => {
    const done = await mk('done', [{ sku: 'D1', price: 50_000 }], full)
    const half = await mk('half', [{ sku: 'H1', price: 0 }])
    const all = await queryProducts({})
    expect(all.rows.find((r) => r.id === done.id)?.completeness).toBe(100)
    const r = await queryProducts({ incomplete: true })
    expect(r.rows.map((p) => p.id)).toEqual([half.id])
  })

  it('rows carry min/max price, total stock, low-stock flag and the active promo name', async () => {
    const p = await mk('promo', [{ sku: 'P1', price: 200_000, stock: 1 }, { sku: 'P2', price: 300_000, stock: 10 }])
    await prisma.promotion.create({ data: { name: 'Autumn', kind: 'PERCENT', value: 10, targetType: 'PRODUCT', targetIds: [p.id] } })
    await mk('nopromo', [{ sku: 'N1', stock: 50 }])
    const r = await queryProducts({ promo: true })
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ id: p.id, minPrice: 200_000, maxPrice: 300_000, totalStock: 11, lowStock: true, promo: 'Autumn' })
    expect((await queryProducts({ promo: false })).rows.map((x) => x.slug)).toEqual(['nopromo'])
  })

  it('sorts and paginates 25 per page', async () => {
    for (let i = 0; i < 27; i++) await mk(`p${String(i).padStart(2, '0')}`, [{ sku: `S${i}`, price: 1000 * (i + 1) }])
    const first = await queryProducts({ sort: 'price', dir: 'desc' })
    expect(first.total).toBe(27)
    expect(first.rows).toHaveLength(25)
    expect(first.rows[0].slug).toBe('p26')
    const second = await queryProducts({ sort: 'price', dir: 'desc', page: 2 })
    expect(second.rows.map((r) => r.slug)).toEqual(['p01', 'p00'])
  })
})
