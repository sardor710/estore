import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { createSession, SESSION_COOKIE } from '@/lib/auth'

// Admin edits must reach live search at once, not after the 15 s search cache expires.
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { publishAction } = await import('@/app/admin/actions/products')
const { saveCategoryAction } = await import('@/app/admin/actions')
const { saveBrandAction } = await import('@/app/admin/actions/brands')
const { searchProducts, suggest, setSearchCacheEnabled, resetSearchCache } = await import('@/lib/search/service')

const saved = { ...process.env }
beforeEach(async () => {
  process.env.SESSION_SECRET = 'z'.repeat(40)
  process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = 'true'
  jar.clear()
  setSearchCacheEnabled(true)
  resetSearchCache()
  const u = await prisma.adminUser.create({ data: { email: 'pm@shop.uz', name: 'PM', role: 'PRODUCT_MANAGER', active: true, passwordHash: 'x' } })
  jar.set(SESSION_COOKIE, await createSession({ uid: u.id, role: 'PRODUCT_MANAGER', sv: u.sessionVersion }))
})
afterEach(() => {
  setSearchCacheEnabled(false)
  resetSearchCache()
  process.env = { ...saved }
})

async function mkProduct(slug: string, categoryId: number, title: string, brandId: number | null = null) {
  return prisma.product.create({
    data: {
      slug,
      categoryId,
      brandId,
      status: 'PUBLISHED',
      title: { en: title },
      subtitle: {},
      shortSpec: {},
      descriptionHtml: {},
      sections: [],
      highlights: [],
      inTheBox: [],
      faq: [],
      specs: [],
      images: [],
      reviewed: { uz: true, ru: true },
      variants: { create: [{ sku: `${slug}-1`, name: { en: slug }, priceUzs: 100000, stock: 5, sortOrder: 0 }] },
    },
  })
}
const slugs = async (q: string) => (await searchProducts(q, 'en')).map((p) => p.slug)

describe('search cache invalidation by admin actions', () => {
  it('serves cached rows until an admin action clears them', async () => {
    const c = await prisma.category.create({ data: { slug: 'chargers', template: 'DETAILED', name: { en: 'Chargers' } } })
    const p = await mkProduct('alpha', c.id, 'Alpha charger')
    expect(await slugs('alpha')).toEqual(['alpha'])
    await prisma.product.update({ where: { id: p.id }, data: { title: { en: 'Gamma charger' } } }) // edit that skips the actions
    expect(await slugs('gamma')).toEqual([]) // the cache is real
  })
  it('unpublishing a product removes it from search immediately', async () => {
    const c = await prisma.category.create({ data: { slug: 'chargers', template: 'DETAILED', name: { en: 'Chargers' } } })
    const p = await mkProduct('alpha', c.id, 'Alpha charger')
    expect(await slugs('alpha')).toEqual(['alpha'])
    const r = await publishAction(p.id, false)
    expect(r.ok).toBe(true)
    expect(await slugs('alpha')).toEqual([])
  })
  it('renaming a category updates category suggestions immediately', async () => {
    const c = await prisma.category.create({ data: { slug: 'chargers', template: 'DETAILED', name: { en: 'Chargers' } } })
    expect((await suggest('chargers', 'en')).categories.map((x) => x.name)).toEqual(['Chargers'])
    const r = await saveCategoryAction(c.id, { slug: 'chargers', name: { en: 'Adapters' }, parentId: null, sortOrder: 0, template: 'DETAILED' })
    expect(r.ok).toBe(true)
    expect((await suggest('adapters', 'en')).categories.map((x) => x.name)).toEqual(['Adapters'])
  })
  it('renaming a brand updates brand matches immediately', async () => {
    const c = await prisma.category.create({ data: { slug: 'chargers', template: 'DETAILED', name: { en: 'Chargers' } } })
    const b = await prisma.brand.create({ data: { name: 'Acme', slug: 'acme' } })
    await mkProduct('alpha', c.id, 'Alpha charger', b.id)
    expect(await slugs('acme')).toEqual(['alpha'])
    const r = await saveBrandAction({ id: b.id, name: 'Zenith', slug: 'zenith', logoUrl: '', sortOrder: 0 })
    expect(r.ok).toBe(true)
    expect(await slugs('zenith')).toEqual(['alpha'])
  })
})
