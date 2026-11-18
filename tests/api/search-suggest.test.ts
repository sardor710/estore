import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import { GET } from '@/app/api/search/suggest/route'

async function mkCat(slug: string, name: Record<string, string>) {
  return prisma.category.create({ data: { slug, template: 'DETAILED', name } })
}

async function mkProduct(slug: string, categoryId: number, title: Record<string, string>, status = 'PUBLISHED') {
  return prisma.product.create({
    data: {
      slug,
      categoryId,
      status,
      title,
      subtitle: {},
      shortSpec: {},
      descriptionHtml: {},
      sections: [],
      highlights: [],
      inTheBox: [],
      faq: [],
      specs: [],
      images: ['/uploads/x.webp'],
      reviewed: { uz: false, ru: false },
      variants: { create: [{ sku: `${slug}-1`, name: { en: slug }, priceUzs: 100000, stock: 5, sortOrder: 0 }] },
    },
  })
}

const get = async (qs: string) => {
  const res = await GET(new Request(`http://localhost:3000/api/search/suggest?${qs}`) as never)
  return { status: res.status, body: await res.json() }
}

describe('GET /api/search/suggest', () => {
  it('returns at most 6 published products, typo-tolerant', async () => {
    const c = await mkCat('chargers', { en: 'Chargers', uz: 'Zaryadlovchilar' })
    for (let i = 1; i <= 8; i++) await mkProduct(`anker-${i}`, c.id, { en: `Anker charger ${i}` })
    await mkProduct('anker-hidden', c.id, { en: 'Anker hidden' }, 'DRAFT')
    const { status, body } = await get('q=ankr&locale=en')
    expect(status).toBe(200)
    expect(body.products).toHaveLength(6)
    expect(body.products.map((p: { slug: string }) => p.slug)).not.toContain('anker-hidden')
    expect(body.products[0]).toMatchObject({ title: expect.stringContaining('Anker'), image: '/uploads/x.webp', priceUzs: 100000 })
  })
  it('suggests matching categories in the requested locale', async () => {
    await mkCat('chargers', { en: 'Chargers', uz: 'Zaryadlovchilar' })
    const { body } = await get('q=zaryad&locale=uz')
    expect(body.categories[0]).toEqual({ slug: 'chargers', name: 'Zaryadlovchilar' })
  })
  it('returns empty lists for a 1-char query and survives junk input', async () => {
    const c = await mkCat('chargers', { en: 'Chargers' })
    await mkProduct('a1', c.id, { en: 'Anker' })
    expect((await get('q=a&locale=en')).body).toEqual({ products: [], categories: [] })
    const junk = await get(`q=${'a'.repeat(300)}&locale=xx`)
    expect(junk.status).toBe(200)
    expect((await get('locale=en')).body).toEqual({ products: [], categories: [] })
  })
})

describe('GET /api/search/suggest rate limit', () => {
  it('answers 429 after 120 requests a minute from one client', async () => {
    const { suggestLimiter } = await import('@/lib/search/limit')
    suggestLimiter.reset()
    const saved = process.env.TRUST_PROXY
    process.env.TRUST_PROXY = '1'
    try {
      const hit = () => GET(new Request('http://localhost:3000/api/search/suggest?q=a&locale=en', { headers: { 'x-forwarded-for': '7.7.7.7' } }) as never)
      for (let i = 0; i < 120; i++) expect((await hit()).status).toBe(200)
      const res = await hit()
      expect(res.status).toBe(429)
      expect(res.headers.get('retry-after')).toBe('60')
    } finally {
      process.env.TRUST_PROXY = saved
      suggestLimiter.reset()
    }
  })
})
