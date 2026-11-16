import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import { SITE_URL, alternatesFor, productJsonLd, jsonLdScript, stripHtml, truncate } from '@/lib/seo'
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
