import { prisma } from '@/lib/db'
import { sanitizeHtml } from '@/lib/sanitize'
import {
  ImportError,
  normalizeAnkerUrl,
  parseAnkerHtml,
  slugify,
  type ImportedProduct,
} from './anker-parse'

export { ImportError, normalizeAnkerUrl, parseAnkerHtml } from './anker-parse'
export type { ImportedProduct } from './anker-parse'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export type ImportOpts = {
  /** Category id (Product.categoryId). Defaults to the `chargers` category. */
  categoryId?: number | string
  /** Injectable fetcher (tests); defaults to {@link fetchAnkerHtml}. */
  fetchHtml?: (url: string) => Promise<string>
}

export async function fetchAnkerHtml(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-US',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    })
  } catch (e) {
    throw new ImportError('FETCH_FAILED', `Network error: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (res.status === 404) throw new ImportError('NOT_FOUND', 'Product page not found (404)')
  if (!res.ok) throw new ImportError('FETCH_FAILED', `HTTP ${res.status}`)
  try {
    return await res.text()
  } catch (e) {
    throw new ImportError('FETCH_FAILED', `Failed reading response: ${e instanceof Error ? e.message : String(e)}`)
  }
}

type L10nObj = Record<string, string>
type SpecItem = { label: string; value: string; valueL10n?: L10nObj }
type SpecGroup = { group: string; items: SpecItem[] }

/** Short numeric stat from a feature title, e.g. "100W", "40%". */
function statOf(title: string): string | undefined {
  const m = /(?<![\w.])(\d+(?:[.,]\d+)?\s?(?:W|mAh|%|hrs?|hours?|h|dB|mm|g|kg|V|A)\b|\d+(?:[.,]\d+)?%)/i.exec(title)
  return m ? m[1].replace(/\s+/g, '') : undefined
}

function buildHighlights(p: ImportedProduct) {
  return p.highlights.map((h) => {
    const stat = statOf(h.title)
    return { title: { en: h.title }, ...(stat ? { value: stat } : {}) }
  })
}
function buildSections(p: ImportedProduct) {
  return p.highlights.filter((h) => h.body).map((h) => ({ heading: { en: h.title }, body: { en: h.body } }))
}

const SHORT_SPEC_PRIORITY = [
  /^(total|max(imum)?) output|^output power|^power output/i,
  /^capacity/i,
  /^(usb-?c )?ports?\b|^output ports?/i,
  /^battery (life|capacity)|^playtime|^playback/i,
  /^(wireless|bluetooth)/i,
  /^weight/i,
]
function buildShortSpec(groups: ImportedProduct['specGroups']): string {
  const items = groups.flatMap((g) => g.items)
  const picked: string[] = []
  for (const re of SHORT_SPEC_PRIORITY) {
    const it = items.find((i) => re.test(i.label))
    if (!it) continue
    const v = it.value.split(' / ')[0].trim()
    if (v && v.length <= 40 && !picked.includes(v)) picked.push(v)
    if (picked.length === 3) break
  }
  if (picked.length < 2) {
    for (const it of items) {
      const v = it.value.split(' / ')[0].trim()
      if (v && v.length <= 30 && !picked.includes(v)) picked.push(v)
      if (picked.length === 3) break
    }
  }
  return picked.join(' · ')
}

async function upsertSpecLabels(groups: ImportedProduct['specGroups']) {
  const pairs = new Map<string, string>()
  for (const g of groups) {
    pairs.set(slugify(g.group), g.group)
    for (const i of g.items) pairs.set(slugify(i.label), i.label)
  }
  for (const [key, en] of pairs) {
    if (!key) continue
    const existing = await prisma.specLabel.findUnique({ where: { key } })
    if (!existing) {
      await prisma.specLabel.create({ data: { key, label: { en } } })
    } else {
      const cur = (existing.label ?? {}) as L10nObj
      if (!cur.en) await prisma.specLabel.update({ where: { key }, data: { label: { ...cur, en } } })
    }
  }
}

function buildSpecs(groups: ImportedProduct['specGroups'], prev: SpecGroup[] = []): SpecGroup[] {
  return groups
    .map((g) => {
      const gKey = slugify(g.group)
      const prevGroup = prev.find((pg) => pg.group === gKey)
      return {
        group: gKey,
        items: g.items
          .map((i) => {
            const lKey = slugify(i.label)
            const old = prevGroup?.items.find((pi) => pi.label === lKey)
            const item: SpecItem = { label: lKey, value: i.value }
            if (old?.valueL10n && old.value === i.value) item.valueL10n = old.valueL10n
            return item
          })
          .filter((i) => i.label),
      }
    })
    .filter((g) => g.group && g.items.length > 0)
}

function imageIndexOf(images: string[], url?: string): number | null {
  if (!url) return null
  const i = images.indexOf(url)
  return i >= 0 ? i : null
}

async function resolveCategoryId(categoryId?: number | string): Promise<number> {
  if (categoryId !== undefined && categoryId !== '') {
    const id = Number(categoryId)
    const cat = Number.isInteger(id) ? await prisma.category.findUnique({ where: { id } }) : null
    if (!cat) throw new Error(`Category not found: ${categoryId}`)
    return cat.id
  }
  const def = await prisma.category.findUnique({ where: { slug: 'chargers' } })
  if (!def) throw new Error('Default category "chargers" not found; seed the database or pass categoryId')
  return def.id
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base
  for (let n = 2; await prisma.product.findUnique({ where: { slug } }); n++) slug = `${base}-${n}`
  return slug
}

async function load(url: string, fetchHtml?: ImportOpts['fetchHtml']) {
  const norm = normalizeAnkerUrl(url)
  const html = await (fetchHtml ?? fetchAnkerHtml)(norm)
  return { norm, parsed: parseAnkerHtml(html, norm) }
}

export async function importAnkerProduct(
  url: string,
  opts: ImportOpts = {},
): Promise<{ productId: number; created: boolean }> {
  const norm = normalizeAnkerUrl(url)
  const existing = await prisma.product.findUnique({ where: { sourceUrl: norm } })
  if (existing) return { productId: existing.id, created: false }

  const { parsed: p } = await load(norm, opts.fetchHtml)
  const categoryId = await resolveCategoryId(opts.categoryId)
  const slug = await uniqueSlug(slugify(p.handle) || 'product')
  const specs = buildSpecs(p.specGroups)
  await upsertSpecLabels(p.specGroups)

  const product = await prisma.product.create({
    data: {
      slug,
      categoryId,
      status: 'DRAFT',
      brand: 'Anker',
      sourceUrl: norm,
      sourcePriceUsd: p.variants[0].priceUsd,
      title: { en: p.title },
      subtitle: { en: '' },
      shortSpec: { en: buildShortSpec(p.specGroups) },
      descriptionHtml: { en: sanitizeHtml(p.descriptionHtml) },
      sections: buildSections(p),
      highlights: buildHighlights(p),
      inTheBox: p.inTheBox.map((en) => ({ en })),
      faq: [],
      specs,
      images: p.images,
      reviewed: { uz: false, ru: false },
      isDemo: false,
      variants: {
        create: p.variants.map((v, i) => ({
          sku: v.sku,
          name: { en: v.name },
          imageIndex: imageIndexOf(p.images, v.imageUrl),
          priceUzs: 0,
          stock: 0,
          sortOrder: i,
        })),
      },
    },
  })
  return { productId: product.id, created: true }
}

type Item = { en?: string }
/** Keep existing (translated) item when its EN text is unchanged; otherwise EN-only new item. */
function mergeByEn<T extends Record<string, unknown>>(fresh: T[], old: unknown, field: keyof T & string): T[] {
  const oldArr = Array.isArray(old) ? (old as T[]) : []
  return fresh.map((f) => {
    const en = (f[field] as Item).en
    return oldArr.find((o) => (o?.[field] as Item | undefined)?.en === en) ?? f
  })
}

/** Re-fetch the source page and refresh images/specs/highlights/EN text. Never touches price, stock or uz/ru text. */
export async function refreshAnkerProduct(
  productId: number,
  opts: Pick<ImportOpts, 'fetchHtml'> = {},
): Promise<void> {
  const prod = await prisma.product.findUnique({ where: { id: productId }, include: { variants: true } })
  if (!prod) throw new Error(`Product not found: ${productId}`)
  if (!prod.sourceUrl) throw new Error('Product has no sourceUrl to refresh from')
  const { parsed: p } = await load(prod.sourceUrl, opts.fetchHtml)

  const en = (cur: unknown, v: string) => ({ ...((cur ?? {}) as L10nObj), en: v })
  await upsertSpecLabels(p.specGroups)

  await prisma.product.update({
    where: { id: prod.id },
    data: {
      title: en(prod.title, p.title),
      shortSpec: en(prod.shortSpec, buildShortSpec(p.specGroups)),
      descriptionHtml: en(prod.descriptionHtml, sanitizeHtml(p.descriptionHtml)),
      highlights: mergeByEn(buildHighlights(p), prod.highlights, 'title'),
      sections: mergeByEn(buildSections(p), prod.sections, 'heading'),
      inTheBox: p.inTheBox.map((t) => {
        const old = (Array.isArray(prod.inTheBox) ? prod.inTheBox : []) as Item[]
        return (old.find((o) => o?.en === t) ?? { en: t }) as Record<string, string>
      }),
      specs: buildSpecs(p.specGroups, prod.specs as SpecGroup[]),
      images: p.images,
      sourcePriceUsd: p.variants[0].priceUsd,
    },
  })

  const bySku = new Map(prod.variants.map((v) => [v.sku, v]))
  let order = prod.variants.reduce((m, v) => Math.max(m, v.sortOrder), -1)
  for (const v of p.variants) {
    const idx = imageIndexOf(p.images, v.imageUrl)
    const cur = bySku.get(v.sku)
    if (cur) {
      await prisma.variant.update({ where: { id: cur.id }, data: { imageIndex: idx, name: en(cur.name, v.name) } })
    } else {
      await prisma.variant.create({
        data: { productId: prod.id, sku: v.sku, name: { en: v.name }, imageIndex: idx, priceUzs: 0, stock: 0, sortOrder: ++order },
      })
    }
  }
}
