import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@/lib/db'
import { parseAnkerHtml, normalizeAnkerUrl, ImportError } from '@/lib/importer/anker-parse'
import { importAnkerProduct, refreshAnkerProduct, fetchAnkerHtml } from '@/lib/importer/anker'

const fixture = readFileSync(join(__dirname, '..', 'fixtures', 'anker-a120f.html'), 'utf8')
const URL_A120F = 'https://www.anker.com/products/a120f-100w-usb-c-gan-charger-battery-care'
const fetchFixture = async () => fixture

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    return e instanceof ImportError ? e.code : `other:${String(e)}`
  }
  return undefined
}

const NEXT_RE = /(<script id="__NEXT_DATA__"[^>]*>)([\s\S]*?)(<\/script>)/
const nextData = (html: string) => JSON.parse(html.match(NEXT_RE)![2])
const urlKey = (u: unknown) => {
  const s = typeof u === 'string' ? u : ((u as { url?: string; src?: string } | null)?.url ?? (u as { src?: string } | null)?.src ?? '')
  return s.replace(/^\/\//, 'https://').split(/[?#]/)[0]
}

describe('parseAnkerHtml image selection (synthetic)', () => {
  const withImages = (images: string[], variantImage: string) => {
    const m = fixture.match(NEXT_RE)!
    const next = JSON.parse(m[2])
    const prod = next.props.pageProps.product
    prod.images = images
    prod.variants = prod.variants.map((v: Record<string, unknown>, i: number) => ({ ...v, image: i === 0 ? variantImage : undefined }))
    return fixture.replace(m[0], () => m[1] + JSON.stringify(next).split('<').join(String.fromCharCode(92) + 'u003c') + m[3])
  }
  it('dedupes query variants, caps at 20 and keeps the variant image', () => {
    const many = Array.from({ length: 60 }, (_, i) => `https://cdn.example/p/img${i % 40}.jpg?v=${i}`)
    const p = parseAnkerHtml(withImages(many, 'https://cdn.example/p/variant.jpg?v=9'), URL_A120F)
    expect(p.images.length).toBe(20)
    expect(new Set(p.images.map(urlKey)).size).toBe(20)
    expect(p.images[0]).toBe('https://cdn.example/p/img0.jpg?v=0')
    expect(p.variants[0].imageUrl).toBeDefined()
    expect(p.images).toContain(p.variants[0].imageUrl)
  })
  it('names a variant from every option (color + bundle), like anker.com: "Space Black / Power Bank + Charger"', () => {
    const m = fixture.match(NEXT_RE)!
    const next = JSON.parse(m[2])
    const prod = next.props.pageProps.product
    const opt = (name: string, label: string) => ({ __typename: 'MultipleChoiceOption', name, displayName: name.toLowerCase(), values: [{ label }] })
    const base = prod.variants[0]
    prod.variants = [
      { ...base, sku: 'A1695H11', options: [opt('Color', 'Space Black'), opt('Bundle Choice', 'Power Bank')] },
      { ...base, sku: 'BUNDLE-B26971Z1-1-A1695H11-1', options: [opt('Color', 'Space Black'), opt('Bundle Choice', 'Power Bank + Charger')] },
      { ...base, sku: 'ONLY-COLOR', options: [opt('Color', 'Silver')] },
      { ...base, sku: 'DUP', options: [opt('Color', 'Silver'), opt('Bundle Choice', ' '), opt('Style', 'Silver')] },
      { ...base, sku: 'NO-OPTIONS', title: 'Default Title', options: [] },
    ]
    const html = fixture.replace(m[0], () => m[1] + JSON.stringify(next).split('<').join(String.fromCharCode(92) + 'u003c') + m[3])
    expect(parseAnkerHtml(html, URL_A120F).variants.map((v) => v.name)).toEqual([
      'Space Black / Power Bank',
      'Space Black / Power Bank + Charger',
      'Silver',
      'Silver',
      'Default Title',
    ])
  })
  it('a variant image equal to a product image (other query) maps to the stored URL', () => {
    const p = parseAnkerHtml(withImages(['https://cdn.example/a.jpg?v=1', 'https://cdn.example/b.jpg'], 'https://cdn.example/b.jpg?width=200'), URL_A120F)
    expect(p.images).toEqual(['https://cdn.example/a.jpg?v=1', 'https://cdn.example/b.jpg'])
    expect(p.variants[0].imageUrl).toBe('https://cdn.example/b.jpg')
  })
})

describe('normalizeAnkerUrl', () => {
  it('accepts canonical and tidies query/hash/trailing slash/http/bare host', () => {
    const want = 'https://www.anker.com/products/x'
    expect(normalizeAnkerUrl('https://www.anker.com/products/x?variant=1')).toBe(want)
    expect(normalizeAnkerUrl('http://anker.com/products/x/#reviews')).toBe(want)
    expect(normalizeAnkerUrl('  anker.com/products/x  ')).toBe(want)
    expect(normalizeAnkerUrl('https://WWW.ANKER.COM/products/X-1')).toBe('https://www.anker.com/products/x-1')
  })
  it('rejects other regions/hosts, collections and garbage with BAD_URL', () => {
    for (const bad of [
      'https://uk.anker.com/products/x',
      'https://www.anker.com/uk/products/x',
      'anker.com/uk/products/x',
      'https://www.anker.com/collections/power-banks',
      'https://www.anker.com/products/',
      'https://evil.com/products/x',
      'https://anker.com.evil.com/products/x',
      'javascript:alert(1)',
      'not a url',
      '',
    ]) {
      expect(codeOf(() => normalizeAnkerUrl(bad)), bad).toBe('BAD_URL')
    }
  })
})

describe('parseAnkerHtml (A120F fixture)', () => {
  const p = parseAnkerHtml(fixture, URL_A120F)
  it('core fields', () => {
    expect(p.title).toBe('Anker Laptop Charger Pro')
    expect(p.handle).toBe('a120f-100w-usb-c-gan-charger-battery-care')
    expect(p.sourceUrl).toBe(URL_A120F)
    expect(p.descriptionHtml.length).toBeGreaterThan(50)
  })
  it('variants', () => {
    expect(p.variants.length).toBe(2)
    expect(p.variants[0].sku).toBe('B120FJZ1')
    expect(p.variants[0].priceUsd).toBe(59.99)
    expect(p.variants[0].name).toBe('Iron Gray')
    expect(p.variants[0].available).toBe(true)
    expect(p.variants[0].imageUrl).toMatch(/^https:\/\//)
  })
  it('images deduped absolute https', () => {
    expect(p.images.length).toBeGreaterThanOrEqual(3)
    expect(new Set(p.images).size).toBe(p.images.length)
    for (const i of p.images) expect(i).toMatch(/^https:\/\//)
  })
  it('images come only from product.images + variant images, deduped without query, at most 20', () => {
    const prod = nextData(fixture).props.pageProps.product
    const own = new Set<string>([...prod.images, ...prod.variants.map((v: { image?: unknown }) => v.image)].map(urlKey))
    expect(p.images.length).toBeLessThanOrEqual(20)
    for (const i of p.images) expect(own.has(urlKey(i)), i).toBe(true)
    for (const v of p.variants) if (v.imageUrl) expect(p.images).toContain(v.imageUrl)
  })
  it('highlights exclude hidden keys', () => {
    expect(p.highlights.length).toBeGreaterThanOrEqual(3)
    expect(p.highlights[0].title.startsWith('Extend Your Laptop Battery Lifespan')).toBe(true)
    const titles = p.highlights.map((h) => h.title)
    expect(titles).not.toContain('What You Get')
    expect(titles.some((t) => /^note/i.test(t))).toBe(false)
  })
  it('inTheBox from What You Get', () => {
    expect(p.inTheBox.length).toBeGreaterThanOrEqual(3)
    expect(p.inTheBox[0]).toBe('Anker Laptop Charger Pro')
    expect(p.inTheBox.some((i) => /Zolo USB-C to USB-C Cable \(5 ft, 240W, Braided\)/.test(i))).toBe(true)
  })
  it('spec groups', () => {
    expect(p.specGroups.length).toBeGreaterThanOrEqual(1)
    expect(p.specGroups[0].items.length).toBeGreaterThanOrEqual(3)
    const labels = p.specGroups.flatMap((g) => g.items.map((i) => i.label))
    expect(labels).toContain('Weight')
    expect(p.specGroups[0].items.find((i) => i.label === 'Total Output')?.value).toBe('100W Max')
  })
  it('throws PARSE_FAILED on empty page', () => {
    expect(codeOf(() => parseAnkerHtml('<html></html>', URL_A120F))).toBe('PARSE_FAILED')
  })
})

describe('importAnkerProduct', () => {
  let chargers: { id: number }
  beforeEach(async () => {
    chargers = await prisma.category.create({ data: { slug: 'chargers', name: { en: 'Chargers' } } })
  })

  it('creates a DRAFT product with variants, specs and spec labels; second import is a no-op', async () => {
    const r1 = await importAnkerProduct(URL_A120F + '?variant=123', { fetchHtml: fetchFixture })
    expect(r1.created).toBe(true)
    const prod = await prisma.product.findUniqueOrThrow({
      where: { id: r1.productId },
      include: { variants: true, brand: true },
    })
    expect(prod.status).toBe('DRAFT')
    expect(prod.categoryId).toBe(chargers.id)
    expect(prod.slug).toBe('a120f-100w-usb-c-gan-charger-battery-care')
    expect(prod.sourceUrl).toBe(URL_A120F)
    expect(prod.sourcePriceUsd).toBe(59.99)
    expect(prod.brand?.name).toBe('Anker')
    expect(prod.isDemo).toBe(false)
    expect(prod.reviewed).toEqual({ uz: false, ru: false })
    expect((prod.title as { en: string }).en).toBe('Anker Laptop Charger Pro')
    expect((prod.shortSpec as { en: string }).en).toContain(' · ')
    expect(prod.variants.length).toBe(2)
    for (const v of prod.variants) {
      expect(v.priceUzs).toBe(0)
      expect(v.stock).toBe(0)
    }
    const specs = prod.specs as { group: string; items: { label: string; value: string }[] }[]
    expect(specs[0].items.length).toBeGreaterThanOrEqual(3)
    const lab = await prisma.specLabel.findUnique({ where: { key: 'total-output' } })
    expect(lab?.label).toEqual({ en: 'Total Output' })
    expect((prod.images as string[]).length).toBeGreaterThanOrEqual(3)

    const r2 = await importAnkerProduct(URL_A120F, { fetchHtml: fetchFixture })
    expect(r2).toEqual({ productId: r1.productId, created: false })
    expect(await prisma.product.count()).toBe(1)
  })

  it('links the product to an existing Brand case-insensitively instead of creating a duplicate', async () => {
    const existing = await prisma.brand.create({ data: { name: 'ANKER', slug: 'anker-official' } })
    const r = await importAnkerProduct(URL_A120F, { fetchHtml: fetchFixture })
    expect((await prisma.product.findUniqueOrThrow({ where: { id: r.productId } })).brandId).toBe(existing.id)
    expect(await prisma.brand.count()).toBe(1)
  })

  it('sanitizes description html', async () => {
    const evil = fixture.replace(
      /"descriptionHtml":"/,
      '"descriptionHtml":"<script>alert(1)<\\/script><img src=x onerror=alert(1)>',
    )
    const r = await importAnkerProduct(URL_A120F, { fetchHtml: async () => evil })
    const prod = await prisma.product.findUniqueOrThrow({ where: { id: r.productId } })
    const html = (prod.descriptionHtml as { en: string }).en
    expect(html.length).toBeGreaterThan(50)
    expect(html).not.toMatch(/<script|onerror/i)
  })

  it('uses the given categoryId', async () => {
    const other = await prisma.category.create({ data: { slug: 'power-banks', name: { en: 'PB' } } })
    const r = await importAnkerProduct(URL_A120F, { fetchHtml: fetchFixture, categoryId: other.id })
    const prod = await prisma.product.findUniqueOrThrow({ where: { id: r.productId } })
    expect(prod.categoryId).toBe(other.id)
  })

  it('does not clobber existing uz/ru spec labels', async () => {
    await prisma.specLabel.create({ data: { key: 'weight', label: { en: 'Weight', uz: 'Ogirligi' } } })
    await importAnkerProduct(URL_A120F, { fetchHtml: fetchFixture })
    const lab = await prisma.specLabel.findUniqueOrThrow({ where: { key: 'weight' } })
    expect((lab.label as { uz?: string }).uz).toBe('Ogirligi')
  })

  it('bad url -> BAD_URL; fetch errors propagate as ImportError', async () => {
    await expect(importAnkerProduct('https://example.com/products/x', { fetchHtml: fetchFixture })).rejects.toMatchObject({
      code: 'BAD_URL',
    })
    await expect(
      importAnkerProduct(URL_A120F, {
        fetchHtml: async () => {
          throw new ImportError('NOT_FOUND', 'x')
        },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refresh keeps priceUzs/stock and translations, refreshes images', async () => {
    const r = await importAnkerProduct(URL_A120F, { fetchHtml: fetchFixture })
    const prod = await prisma.product.findUniqueOrThrow({ where: { id: r.productId }, include: { variants: true } })
    const v0 = prod.variants.find((v) => v.sku === 'B120FJZ1')!
    await prisma.variant.update({ where: { id: v0.id }, data: { priceUzs: 1_250_000, stock: 7 } })
    await prisma.product.update({
      where: { id: prod.id },
      data: {
        title: { ...(prod.title as object), uz: 'Anker Noutbuk zaryadkasi', ru: 'RU title' },
        reviewed: { uz: true, ru: false },
        images: [],
      },
    })
    await refreshAnkerProduct(prod.id, { fetchHtml: fetchFixture })
    const after = await prisma.product.findUniqueOrThrow({ where: { id: prod.id }, include: { variants: true } })
    const v = after.variants.find((x) => x.sku === 'B120FJZ1')!
    expect(v.priceUzs).toBe(1_250_000)
    expect(v.stock).toBe(7)
    expect(after.variants.length).toBe(2)
    expect((after.title as { uz: string }).uz).toBe('Anker Noutbuk zaryadkasi')
    expect((after.title as { en: string }).en).toBe('Anker Laptop Charger Pro')
    expect((after.images as string[]).length).toBeGreaterThanOrEqual(3)
    expect(after.reviewed).toEqual({ uz: true, ru: false })
  })

  it('refresh applies changed upstream EN but keeps uz/ru for highlights, sections, in-the-box and spec values', async () => {
    const r = await importAnkerProduct(URL_A120F, { fetchHtml: fetchFixture })
    const prod = await prisma.product.findUniqueOrThrow({ where: { id: r.productId } })
    const hl = (prod.highlights as { title: Record<string, string>; value?: string }[]).map((h, i) =>
      i === 0 ? { ...h, title: { ...h.title, uz: 'UZ highlight' } } : h,
    )
    const sec = (prod.sections as { heading: Record<string, string>; body: Record<string, string> }[]).map((x, i) =>
      i === 0 ? { ...x, heading: { ...x.heading, uz: 'UZ section' }, body: { ...x.body, uz: 'UZ body' } } : x,
    )
    const box = (prod.inTheBox as Record<string, string>[]).map((b) =>
      b.en === 'welcome guide' ? { ...b, uz: 'UZ guide' } : b,
    )
    const specs = (prod.specs as { group: string; items: { label: string; value: string; valueL10n?: object }[] }[]).map((g) => ({
      ...g,
      items: g.items.map((i) => (i.label === 'total-output' ? { ...i, valueL10n: { uz: 'UZ 100W' } } : i)),
    }))
    await prisma.product.update({
      where: { id: prod.id },
      data: { highlights: hl, sections: sec, inTheBox: box, specs, reviewed: { uz: true, ru: false } },
    })
    const changed = fixture
      .replaceAll('Extend Your Laptop Battery Lifespan by Up to 40%*', 'Extend Your Laptop Battery Lifespan by Up to 50%*')
      .replaceAll('welcome guide', 'quick start guide')
      .replace('>100W Max<', '>120W Max<')
    expect(changed).not.toBe(fixture)
    await refreshAnkerProduct(prod.id, { fetchHtml: async () => changed })
    const after = await prisma.product.findUniqueOrThrow({ where: { id: prod.id } })
    const h0 = (after.highlights as { title: Record<string, string> }[])[0]
    expect(h0.title.en).toBe('Extend Your Laptop Battery Lifespan by Up to 50%*')
    expect(h0.title.uz).toBe('UZ highlight')
    const s0 = (after.sections as { heading: Record<string, string>; body: Record<string, string> }[])[0]
    expect(s0.heading.en).toContain('50%')
    expect(s0.heading.uz).toBe('UZ section')
    expect(s0.body.uz).toBe('UZ body')
    const boxAfter = after.inTheBox as Record<string, string>[]
    expect(boxAfter.some((b) => b.en === 'quick start guide' && b.uz === 'UZ guide')).toBe(true)
    const to = (after.specs as { items: { label: string; value: string; valueL10n?: { uz?: string } }[] }[])[0].items.find(
      (i) => i.label === 'total-output',
    )!
    expect(to.value).toBe('120W Max')
    expect(to.valueL10n?.uz).toBe('UZ 100W')
    expect(after.reviewed).toEqual({ uz: true, ru: false })
  })

  it('refresh adds a variant that appeared upstream with price 0', async () => {
    const r = await importAnkerProduct(URL_A120F, { fetchHtml: fetchFixture })
    await prisma.variant.deleteMany({ where: { sku: 'B120FJ41' } })
    await refreshAnkerProduct(r.productId, { fetchHtml: fetchFixture })
    const v = await prisma.variant.findUniqueOrThrow({ where: { sku: 'B120FJ41' } })
    expect(v.priceUzs).toBe(0)
  })
})

describe('fetchAnkerHtml', () => {
  it('maps 404 to NOT_FOUND, other failures to FETCH_FAILED, sends browser headers', async () => {
    const orig = globalThis.fetch
    try {
      let seen: RequestInit | undefined
      globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
        seen = init
        return new Response('x', { status: 404 })
      }) as typeof fetch
      await expect(fetchAnkerHtml(URL_A120F)).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect((seen?.headers as Record<string, string>)['Accept-Language']).toBe('en-US')
      expect((seen?.headers as Record<string, string>)['User-Agent']).toMatch(/Mozilla/)
      globalThis.fetch = (async () => new Response('x', { status: 503 })) as typeof fetch
      await expect(fetchAnkerHtml(URL_A120F)).rejects.toMatchObject({ code: 'FETCH_FAILED' })
      globalThis.fetch = (async () => {
        throw new TypeError('network')
      }) as typeof fetch
      await expect(fetchAnkerHtml(URL_A120F)).rejects.toMatchObject({ code: 'FETCH_FAILED' })
      globalThis.fetch = (async () => new Response('<html>ok</html>', { status: 200 })) as typeof fetch
      await expect(fetchAnkerHtml(URL_A120F)).resolves.toBe('<html>ok</html>')
    } finally {
      globalThis.fetch = orig
    }
  })
})
