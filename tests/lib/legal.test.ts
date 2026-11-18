import { describe, it, expect } from 'vitest'
import { locales } from '@/i18n/routing'
import { fillLegal, legalContent, LEGAL_DOCS, type Block } from '@/lib/legal'
import { getShopDetails } from '@/lib/settings'
import { saveSettings } from '@/lib/admin/settings'

const texts = (b: Block): string[] => (typeof b === 'string' ? [b] : 'ul' in b ? b.ul : [])

describe('legal pages', () => {
  it('every locale has the same documents and section structure', () => {
    const en = legalContent('en')
    for (const l of locales) {
      const c = legalContent(l)
      for (const d of LEGAL_DOCS) {
        expect(c[d].sections.length, `${l}/${d}`).toBe(en[d].sections.length)
        c[d].sections.forEach((s, i) => {
          expect(s.blocks.map((b) => (typeof b === 'string' ? 's' : 'ul' in b ? `ul${b.ul.length}` : 'c')), `${l}/${d}/${s.h}`).toEqual(
            en[d].sections[i].blocks.map((b) => (typeof b === 'string' ? 's' : 'ul' in b ? `ul${b.ul.length}` : 'c')),
          )
        })
      }
    }
  })
  it('links point at existing legal pages and placeholders are known', () => {
    for (const l of locales)
      for (const d of LEGAL_DOCS)
        for (const s of legalContent(l)[d].sections)
          for (const t of s.blocks.flatMap(texts)) {
            for (const m of t.matchAll(/\]\((\/[^)]+)\)/g)) expect(LEGAL_DOCS.map((x) => `/legal/${x}`)).toContain(m[1])
            const filled = fillLegal(t, l, { shopLegalName: 'OOO "Zanko"' })
            expect(filled).not.toMatch(/\{[a-z]+\}/)
          }
  })
  it('states the warranty terms: 1 year, 2 years for cables, 14-day returns', () => {
    const w = JSON.stringify(legalContent('en').warranty)
    expect(w).toContain('12 months')
    expect(w).toContain('24 months: cables')
    expect(w).toContain('within 14 days')
  })
  it('uses the generic seller name until the legal name is set', () => {
    expect(fillLegal('by {seller} on {site}', 'en', { shopLegalName: null })).toBe('by the online store zanko.uz on zanko.uz')
  })
})

describe('shop details settings', () => {
  it('saves, validates and clears', async () => {
    const r = await saveSettings({ minOrderUzs: 0, shop: { shopLegalName: ' OOO "Zanko" ', shopInn: '123456789', shopPhone: '+998 90 123-45-67', shopTelegram: '@zanko_support' } }, { integrations: false })
    expect(r.ok).toBe(true)
    expect(await getShopDetails()).toMatchObject({ shopLegalName: 'OOO "Zanko"', shopInn: '123456789', shopEmail: null })
    const bad = await saveSettings({ minOrderUzs: 0, shop: { shopInn: '12', shopEmail: 'x', shopTelegram: 'zanko' } }, { integrations: false })
    expect(bad).toMatchObject({ ok: false, errors: { shopInn: expect.any(String), shopEmail: expect.any(String), shopTelegram: expect.any(String) } })
    await saveSettings({ minOrderUzs: 0, shop: { shopInn: '' } }, { integrations: false })
    expect((await getShopDetails()).shopInn).toBeNull()
  })
})
