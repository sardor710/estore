import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import { autoSeo, autoSeoDescription, autoSeoTitle, seoIssues, type SeoSource } from '@/lib/seo-auto'
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from '@/lib/admin/products-shared'
import { publishProduct } from '@/lib/admin/products'
import { autoFillAllSeo, seoAudit, suggestSeo } from '@/lib/admin/seo'

const anker: SeoSource = {
  title: { en: 'Anker Nano Charger (45W, Smart Display, 180° Foldable)', ru: 'Зарядное устройство Anker Nano (45 Вт, дисплей)', uz: 'Anker Nano zaryadlovchi (45W, displey)' },
  shortSpec: { en: '45W USB-C charger with a smart display that shows the charging power in real time.', ru: '', uz: '' },
  descriptionHtml: { en: '<p>Long text</p>', ru: '<p>Компактная зарядка 45 Вт с умным дисплеем и складной вилкой.</p>', uz: '' },
  brand: 'Anker',
  category: { en: 'Chargers', ru: 'Зарядные устройства', uz: 'Zaryadlovchilar' },
}

describe('auto SEO texts', () => {
  it('titles fit the limit and keep the product name', () => {
    for (const l of ['uz', 'ru', 'en'] as const) {
      const t = autoSeoTitle(anker, l)
      expect(t.length).toBeLessThanOrEqual(SEO_TITLE_MAX)
      expect(t).toContain('Anker')
    }
    expect(autoSeoTitle(anker, 'en')).toBe('Anker Nano Charger (45W, Smart Display, 180° Foldable) — price')
  })
  it('adds the brand when the title lacks it, and shortens very long titles', () => {
    expect(autoSeoTitle({ ...anker, title: { en: 'Power Bank 10000' } }, 'en')).toBe('Anker Power Bank 10000 — Price in Uzbekistan')
    const long = autoSeoTitle({ ...anker, title: { en: 'Anker ' + 'Very long product name '.repeat(6) } }, 'en')
    expect(long.length).toBeLessThanOrEqual(SEO_TITLE_MAX)
    expect(long).not.toMatch(/\s$/)
  })
  it('descriptions use the locale text, fit the limit and end with the delivery line when there is room', () => {
    const en = autoSeoDescription(anker, 'en')
    expect(en.length).toBeLessThanOrEqual(SEO_DESCRIPTION_MAX)
    expect(en).toMatch(/^Anker Nano Charger .*: 45W USB-C charger/)
    const ru = autoSeoDescription(anker, 'ru')
    expect(ru).toContain('Компактная зарядка 45 Вт')
    expect(ru).toMatch(/доставка по всему Узбекистану\.$/)
    // No uz text at all: falls back to the category.
    expect(autoSeoDescription(anker, 'uz')).toContain('Zaryadlovchilar')
    const huge = autoSeoDescription({ ...anker, shortSpec: { en: 'word '.repeat(80) } }, 'en')
    expect(huge.length).toBeLessThanOrEqual(SEO_DESCRIPTION_MAX)
  })
  it('uses another locale\'s name when one is missing (own wording, no foreign text); onlyEmpty keeps hand-written texts', () => {
    const r = autoSeo({ ...anker, title: { en: 'Anker Nano' } }, { seoTitle: { en: 'Mine' } }, { onlyEmpty: true })
    expect(r.seoTitle).toEqual({ en: 'Mine', uz: 'Anker Nano — Oʻzbekistonda narxi', ru: 'Anker Nano — купить, цена в Узбекистане' })
    expect(r.seoDescription.uz).toBe('Zaryadlovchilar: Anker Nano. Original mahsulot, Oʻzbekiston boʻylab yetkazib berish.')
    expect(autoSeo({ ...anker, title: {} })).toEqual({ seoTitle: {}, seoDescription: {} })
    expect(autoSeo(anker, { seoTitle: { en: 'Mine' } }).seoTitle.en).not.toBe('Mine')
  })
  it('lists issues', () => {
    expect(seoIssues({ seoTitle: { en: 'x'.repeat(71) }, seoDescription: {} })).toEqual(
      expect.arrayContaining([
        { locale: 'en', field: 'title', problem: 'too long' },
        { locale: 'uz', field: 'title', problem: 'missing' },
        { locale: 'ru', field: 'description', problem: 'missing' },
      ]),
    )
    const good = autoSeo(anker)
    expect(seoIssues(good).filter((i) => i.problem !== 'too short')).toEqual([])
  })
})

async function mk(slug: string, extra: { seoTitle?: object; stock?: number } = {}) {
  const cat = await prisma.category.create({ data: { slug: `cat-${slug}`, name: { en: 'Chargers', ru: 'Зарядки', uz: 'Zaryadlovchilar' } } })
  const brand = await prisma.brand.create({ data: { name: `Anker${slug}`, slug: `anker-${slug}` } })
  return prisma.product.create({
    data: {
      slug, categoryId: cat.id, brandId: brand.id, title: { en: 'Nano Charger', ru: 'Зарядка Nano', uz: 'Nano zaryadlovchi' }, subtitle: {}, shortSpec: { en: 'Small 45W charger.' },
      descriptionHtml: {}, sections: [], highlights: [], inTheBox: [], faq: [], specs: [], images: [], reviewed: {},
      seoTitle: extra.seoTitle ?? {}, seoDescription: {},
      variants: { create: [{ sku: `${slug}-1`, name: {}, priceUzs: 1000, stock: extra.stock ?? 0 }, { sku: `${slug}-2`, name: {}, priceUzs: 1000, stock: 0 }] },
    },
  })
}

describe('auto SEO in the admin', () => {
  it('publishing with 0 stock works and fills blank SEO texts, keeping hand-written ones', async () => {
    const p = await mk('pub', { seoTitle: { en: 'Hand-written title' } })
    expect(await publishProduct(p.id)).toEqual({ ok: true })
    const db = await prisma.product.findUniqueOrThrow({ where: { id: p.id } })
    expect(db.status).toBe('PUBLISHED')
    expect(db.seoTitle).toMatchObject({ en: 'Hand-written title', ru: expect.stringContaining('Зарядка Nano'), uz: expect.stringContaining('Nano zaryadlovchi') })
    expect((db.seoDescription as Record<string, string>).en).toContain('Small 45W charger.')
  })
  it('bulk fill and rewrite, and the audit', async () => {
    const a = await mk('a')
    const b = await mk('b', { seoTitle: { en: 'Mine' } })
    expect((await seoAudit()).find((r) => r.id === a.id)?.issues.length).toBeGreaterThan(0)
    expect(await autoFillAllSeo()).toBe(2)
    expect(await autoFillAllSeo()).toBe(0)
    expect((await prisma.product.findUniqueOrThrow({ where: { id: b.id } })).seoTitle).toMatchObject({ en: 'Mine' })
    expect(await autoFillAllSeo({ overwrite: true, ids: [b.id] })).toBe(1)
    expect(((await prisma.product.findUniqueOrThrow({ where: { id: b.id } })).seoTitle as Record<string, string>).en).toContain('Nano Charger')
  })
  it('suggests texts for an unsaved draft with the chosen brand and category', async () => {
    const p = await mk('draft')
    const r = await suggestSeo({ ...p, title: { en: 'Unsaved name' } }, false)
    expect(r.seoTitle.en).toMatch(/^Ankerdraft Unsaved name/)
  })
})
