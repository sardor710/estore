import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import { SITE_URL, alternatesFor, articleJsonLd, productJsonLd, jsonLdScript, stripHtml, truncate } from '@/lib/seo'
import sitemap from '@/app/sitemap'
import robots from '@/app/robots'

describe('alternatesFor', () => {
  it('builds absolute per-locale urls with x-default -> uz', () => {
    const a = alternatesFor('/p/x')
    expect(a.languages.uz).toBe(`${SITE_URL}/uz/p/x`)
    expect(a.languages.ru).toBe(`${SITE_URL}/ru/p/x`)
    expect(a.languages.en).toBe(`${SITE_URL}/en/p/x`)
    expect(a.languages['x-default']).toBe(`${SITE_URL}/uz/p/x`)
    expect(a.canonical).toBe(`${SITE_URL}/uz/p/x`)
  })
  it('home path', () => {
    expect(alternatesFor('/').languages.ru).toBe(`${SITE_URL}/ru`)
  })
  it('SITE_URL has no trailing slash', () => {
    expect(SITE_URL.endsWith('/')).toBe(false)
  })
})

describe('helpers', () => {
  it('stripHtml + truncate', () => {
    expect(stripHtml('<p>Hi <b>there</b></p>&amp;')).toBe('Hi there &')
    expect(truncate('a'.repeat(200), 160).length).toBeLessThanOrEqual(160)
  })
  it('jsonLdScript escapes <', () => {
    const s = jsonLdScript({ name: '</script><script>alert(1)' })
    expect(s).not.toContain('<')
    expect(s).toContain('\\u003c')
    expect(JSON.parse(s).name).toBe('</script><script>alert(1)')
  })
})

const product = {
  slug: 'x',
  brand: 'Anker',
  title: { en: 'Charger' },
  shortSpec: { en: 'Fast' },
  images: ['https://img/a.jpg'],
}
describe('productJsonLd', () => {
  it('UZS, no rating, availability from stock', () => {
    const ld = productJsonLd(
      product,
      [
        { sku: 'A', priceUzs: 100000, stock: 3 },
        { sku: 'B', priceUzs: 120000, stock: 0 },
      ],
      'en',
    ) as any
    expect(ld['@type']).toBe('Product')
    expect(ld.aggregateRating).toBeUndefined()
    expect(ld.review).toBeUndefined()
    expect(ld.brand.name).toBe('Anker')
    expect(ld.image).toEqual(['https://img/a.jpg'])
    expect(ld.url).toBe(`${SITE_URL}/en/p/x`)
    expect(ld.offers).toHaveLength(2)
    expect(ld.offers[0].priceCurrency).toBe('UZS')
    expect(ld.offers[0].price).toBe('100000')
    expect(ld.offers[0].sku).toBe('A')
    expect(ld.offers[0].availability).toBe('https://schema.org/InStock')
    expect(ld.offers[1].availability).toBe('https://schema.org/OutOfStock')
  })
})

describe('productJsonLd edge cases', () => {
  it('absolutizes relative images', () => {
    const ld = productJsonLd({ ...product, images: ['/uploads/a.jpg', 'https://cdn.x/b.jpg'] }, [{ sku: 'A', priceUzs: 1, stock: 1 }], 'en') as any
    expect(ld.image).toEqual([SITE_URL + '/uploads/a.jpg', 'https://cdn.x/b.jpg'])
  })
  it('omits offers and sku with no variants', () => {
    const ld = productJsonLd(product, [], 'en') as any
    expect('offers' in ld).toBe(false)
    expect('sku' in ld).toBe(false)
  })
})

describe('articleJsonLd', () => {
  const post = {
    slug: 'hello', title: { en: 'Hello', uz: 'Salom' }, excerpt: { en: 'Ex' }, contentHtml: { en: '<p>Body text</p>' },
    seoTitle: {}, seoDescription: {}, coverImage: '/uploads/2026/06/ab12.png',
    publishedAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-06-02T00:00:00Z'),
  }
  it('is a BlogPosting with language, dates and absolute image', () => {
    const ld = articleJsonLd(post, 'uz') as any
    expect(ld['@type']).toBe('BlogPosting')
    expect(ld.headline).toBe('Salom')
    expect(ld.inLanguage).toBe('uz')
    expect(ld.datePublished).toBe('2026-06-01T00:00:00.000Z')
    expect(ld.dateModified).toBe('2026-06-02T00:00:00.000Z')
    expect(ld.image).toEqual([`${SITE_URL}/uploads/2026/06/ab12.png`])
    expect(ld.mainEntityOfPage).toBe(`${SITE_URL}/uz/blog/hello`)
  })
  it('omits image without a cover', () => {
    expect('image' in (articleJsonLd({ ...post, coverImage: null }, 'en') as any)).toBe(false)
  })
})

describe('sitemap blog', () => {
  it('lists the blog index and visible posts in 3 locales', async () => {
    const mk = (slug: string, status: string, publishedAt: Date | null) =>
      prisma.blogPost.create({
        data: { slug, status, publishedAt, title: { en: slug }, excerpt: {}, contentHtml: {}, seoTitle: {}, seoDescription: {}, tags: [], reviewed: {} },
      })
    await mk('live-post', 'PUBLISHED', new Date('2026-01-01'))
    await mk('draft-post', 'DRAFT', null)
    await mk('future-post', 'PUBLISHED', new Date('2999-01-01'))
    const urls = (await sitemap()).map((e) => e.url)
    for (const l of ['uz', 'ru', 'en']) {
      expect(urls).toContain(`${SITE_URL}/${l}/blog/live-post`)
      expect(urls).toContain(`${SITE_URL}/${l}/blog`)
    }
    expect(urls.some((u) => u.includes('draft-post') || u.includes('future-post'))).toBe(false)
  })
})

describe('sitemap', () => {
  it('excludes DRAFT and demo, includes 3 locales', async () => {
    const cat = await prisma.category.create({ data: { slug: 'chargers', template: 'DETAILED', name: { en: 'c' } } })
    const mk = (slug: string, status: string, isDemo = false) =>
      prisma.product.create({
        data: {
          slug, categoryId: cat.id, status, isDemo, title: {}, subtitle: {}, shortSpec: {}, descriptionHtml: {},
          sections: [], highlights: [], inTheBox: [], faq: [], specs: [], images: [], reviewed: { uz: false, ru: false },
        },
      })
    await mk('pub', 'PUBLISHED')
    await mk('draft', 'DRAFT')
    await mk('demo', 'PUBLISHED', true)
    const entries = await sitemap()
    const urls = entries.map((e) => e.url)
    for (const l of ['uz', 'ru', 'en']) {
      expect(urls).toContain(`${SITE_URL}/${l}/p/pub`)
      expect(urls).toContain(`${SITE_URL}/${l}/c/chargers`)
      expect(urls).toContain(`${SITE_URL}/${l}`)
    }
    expect(urls.some((u) => u.includes('/p/draft'))).toBe(false)
    expect(urls.some((u) => u.includes('/p/demo'))).toBe(false)
    const e = entries.find((x) => x.url === `${SITE_URL}/ru/p/pub`)!
    expect(e.alternates?.languages?.en).toBe(`${SITE_URL}/en/p/pub`)
  })
})

describe('robots', () => {
  it('disallows admin and api, points at sitemap', () => {
    const r = robots()
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules
    expect(rule.disallow).toEqual(expect.arrayContaining(['/admin', '/api']))
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`)
  })
})

describe('productMeta (storefront product page metadata)', () => {
  it("uses the locale's SEO title/description when set, else the title and short spec/description", async () => {
    const { productMeta } = await import('@/lib/seo')
    const p = {
      title: { en: 'Charger', ru: 'Зарядка' },
      shortSpec: { en: '100W GaN' },
      descriptionHtml: { ru: '<p>Описание</p>' },
      seoTitle: { en: 'Best 100W charger', ru: '   ' },
      seoDescription: { ru: 'SEO описание' },
    }
    expect(productMeta(p, 'en', 'Shop')).toEqual({ title: 'Best 100W charger', description: '100W GaN' })
    expect(productMeta(p, 'ru', 'Shop')).toEqual({ title: 'Зарядка — Shop', description: 'SEO описание' })
    expect(productMeta({ ...p, seoTitle: undefined, seoDescription: undefined }, 'en', 'Shop')).toEqual({ title: 'Charger — Shop', description: '100W GaN' })
  })
})
