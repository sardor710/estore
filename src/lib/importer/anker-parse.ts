import * as cheerio from 'cheerio'

export type ImportedProduct = {
  sourceUrl: string
  handle: string
  title: string
  descriptionHtml: string
  images: string[]
  highlights: { title: string; body: string }[]
  inTheBox: string[]
  specGroups: { group: string; items: { label: string; value: string }[] }[]
  variants: { sku: string; name: string; priceUsd: number; imageUrl?: string; available: boolean }[]
  /** Overview blocks (anker.com `metafields.components`), in page order. */
  banners: ImportedBanner[]
  faq: { q: string; a: string; sourceKey: string }[]
}

export type ImportedBanner = { heading: string; body: string; image: string; imageMobile?: string; sourceKey: string }

export type ImportErrorCode = 'BAD_URL' | 'FETCH_FAILED' | 'NOT_FOUND' | 'PARSE_FAILED'

export class ImportError extends Error {
  code: ImportErrorCode
  constructor(code: ImportErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'ImportError'
    this.code = code
  }
}

/** Lowercase a-z0-9 and '-' key (used for SpecLabel keys). */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Accept only anker.com / www.anker.com + /products/<handle>; strip query, hash, trailing slash. */
export function normalizeAnkerUrl(input: string): string {
  const raw = (input ?? '').trim()
  if (!raw) throw new ImportError('BAD_URL', 'Empty URL')
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  let u: URL
  try {
    u = new URL(withScheme)
  } catch {
    throw new ImportError('BAD_URL', 'Not a valid URL')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ImportError('BAD_URL', 'Unsupported protocol')
  const host = u.hostname.toLowerCase()
  if (host !== 'anker.com' && host !== 'www.anker.com') throw new ImportError('BAD_URL', 'Only anker.com product URLs are supported')
  const m = /^\/products\/([A-Za-z0-9][A-Za-z0-9_-]*)\/?$/.exec(u.pathname)
  if (!m) throw new ImportError('BAD_URL', 'URL must look like https://www.anker.com/products/<handle>')
  return `https://www.anker.com/products/${m[1].toLowerCase()}`
}

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const asStr = (v: unknown): string => (typeof v === 'string' ? v : '')

function textOf(html: string): string {
  return cheerio.load(`<div>${html}</div>`)('div').text().replace(/\s+/g, ' ').trim()
}

export const MAX_IMAGES = 20

function absHttps(u: unknown): string | null {
  const s = isObj(u) ? asStr(u.url ?? u.src) : asStr(u)
  if (!s) return null
  const t = s.trim()
  if (t.startsWith('//')) return `https:${t}`
  if (/^https:\/\//i.test(t)) return t
  if (/^http:\/\//i.test(t)) return t.replace(/^http:/i, 'https:')
  return null
}

function priceOf(v: unknown): number | null {
  const raw = isObj(v) ? (v.amount ?? v.value) : v
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseFloat(raw) : NaN
  return Number.isFinite(n) ? n : null
}

/** Split "A, B (x, y), C" on top-level commas / newlines / middots. */
function splitBox(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of value) {
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if (depth === 0 && (ch === ',' || ch === '\n' || ch === '·' || ch === ';')) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
    .map((s) => s.trim().replace(/^and\s+/i, '').replace(/[.\s]+$/, '').trim())
    .filter((s) => s && !/customer service/i.test(s))
}

function parseSpecs($: cheerio.CheerioAPI): ImportedProduct['specGroups'] {
  let root = $('#productSpecs')
  if (!root.length) {
    root = $('section, div')
      .filter((_, e) => /^(tech(nical)? )?specs?(ifications)?$/i.test($(e).children('h2,h3').first().text().trim()))
      .first()
  }
  if (!root.length) return []

  const groups: ImportedProduct['specGroups'] = []
  let current: ImportedProduct['specGroups'][number] | null = null
  const push = (label: string, value: string) => {
    if (!label || !value) return
    if (!current) {
      current = { group: 'General', items: [] }
      groups.push(current)
    }
    current.items.push({ label, value })
  }

  root.find('*').each((_, el) => {
    const $el = $(el)
    const tag = el.type === 'tag' ? el.name : ''
    // sub-headings (h3-h5) start a new group; the section's own h2 title is skipped
    if (tag === 'h3' || tag === 'h4' || tag === 'h5') {
      const name = $el.text().replace(/\s+/g, ' ').trim()
      if (name) {
        current = { group: name, items: [] }
        groups.push(current)
      }
      return
    }
    // label/value pair: element with exactly two <p> children
    if (tag === 'div' || tag === 'li') {
      const ps = $el.children('p')
      if (ps.length === 2 && $el.children().length === 2) {
        push($(ps[0]).text().replace(/\s+/g, ' ').trim(), $(ps[1]).text().replace(/\s+/g, ' ').trim())
        return
      }
    }
    if (tag === 'tr') {
      const cells = $el.children('th,td')
      if (cells.length === 2) push($(cells[0]).text().replace(/\s+/g, ' ').trim(), $(cells[1]).text().replace(/\s+/g, ' ').trim())
    }
  })
  return groups.filter((g) => g.items.length > 0)
}

export const MAX_BANNERS = 40

/** Components that are not overview media (or are read elsewhere). */
const NON_OVERVIEW = /^(reviews|faq|htmlContainer|productSpecs|variantsMetafields)(_\d+)?$/
const VIDEO_RE = /\.(mp4|webm|mov|m3u8)$/i
const DESKTOP_KEYS = ['src', 'img', 'image', 'pcImg']
const MOBILE_KEYS = ['srcMb', 'mobImg', 'imageMob', 'mobileImg', 'mbImg']
const POSTER_KEYS = ['poster', 'cover', 'posterImg']

const plain = (v: unknown): string => {
  const s = asStr(v)
  return s ? textOf(s.replace(/<br\s*\/?>/gi, ' ')) : ''
}
const firstText = (...vals: unknown[]): string => {
  for (const v of vals) {
    const t = plain(v)
    if (t) return t
  }
  return ''
}
/** First https picture under any of `keys` (videos rejected). */
function pictureOf(o: Json, keys: string[]): string | undefined {
  for (const k of keys) {
    const u = absHttps(o[k])
    if (u && !VIDEO_RE.test(u.split(/[?#]/)[0])) return u
  }
  return undefined
}
/** Blocks that link to other products (recommendation carousels) are not this product's story. */
// Only links to an anker.com product page count (absolute, or a string value starting with /products/);
// Shopify CDN image paths like cdn.shopify.com/.../products/x.jpg are pictures, not links.
const linksOtherProducts = (block: unknown): boolean =>
  /"(handle|productId)"\s*:|"(?:https?:)?(?:\/\/(?:www\.)?anker\.com)?\/products\/[A-Za-z0-9]/i.test(JSON.stringify(block))

/** anker.com overview blocks -> banners (heading, body, desktop + mobile image) and the FAQ. */
export function parseOverview(components: unknown): { banners: ImportedBanner[]; faq: ImportedProduct['faq'] } {
  const raw: Omit<ImportedBanner, 'sourceKey'>[] = []
  const faq: ImportedProduct['faq'] = []
  if (!isObj(components)) return { banners: [], faq }

  const push = (o: Json, heading: string, body: string) => {
    const image = pictureOf(o, DESKTOP_KEYS) ?? pictureOf(o, POSTER_KEYS)
    if (!image) return false
    const imageMobile = pictureOf(o, MOBILE_KEYS)
    raw.push({ heading, body, image, ...(imageMobile && imageMobile !== image ? { imageMobile } : {}) })
    return true
  }

  for (const [key, block] of Object.entries(components)) {
    if (NON_OVERVIEW.test(key) || !isObj(block) || linksOtherProducts(block)) continue
    const top = isObj(block.topContent) ? block.topContent : isObj(block._topContent) ? block._topContent : {}
    let blockTitle = firstText(block.title, top.title)
    const blockBody = firstText(block.subTitle, block.desc, top.desc)
    if (push(block, blockTitle, blockBody)) blockTitle = ''
    for (const item of Array.isArray(block.list) ? block.list : []) {
      if (!isObj(item)) continue
      const heading = firstText(item.title, item.txt) || blockTitle
      const body = firstText(item.subTitle, item.desc)
      let used = push(item, heading, body)
      for (const child of Array.isArray(item.child) ? item.child : []) {
        if (isObj(child) && push(child, used ? '' : heading, used ? '' : body)) used = true
      }
      if (used && heading === blockTitle) blockTitle = ''
    }
  }

  const faqBlock = components.faq
  const items = isObj(faqBlock) && Array.isArray(faqBlock.items) ? faqBlock.items : []
  const faqKeys = new Map<string, number>()
  for (const it of items) {
    if (!isObj(it)) continue
    const q = plain(it.question)
    const a = plain(it.answer)
    if (q && a) faq.push({ q, a, sourceKey: uniqueKey(faqKeys, slugify(q)) })
  }

  const seen = new Set<string>()
  const keys = new Map<string, number>()
  const banners: ImportedBanner[] = []
  for (const b of raw) {
    const imgKey = b.image.split(/[?#]/)[0]
    if (seen.has(imgKey)) continue
    seen.add(imgKey)
    banners.push({ ...b, sourceKey: uniqueKey(keys, slugify(b.heading) || imgKey) })
    if (banners.length === MAX_BANNERS) break
  }
  return { banners, faq }
}

function uniqueKey(used: Map<string, number>, base: string): string {
  const n = (used.get(base) ?? 0) + 1
  used.set(base, n)
  return n === 1 ? base : `${base}-${n}`
}

export function parseAnkerHtml(html: string, url: string): ImportedProduct {
  const $ = cheerio.load(html)

  let next: Json | null = null
  try {
    const parsed = JSON.parse($('script#__NEXT_DATA__').first().text())
    if (isObj(parsed)) next = parsed
  } catch {
    /* handled below */
  }
  const props = next && isObj(next.props) ? next.props : null
  const pageProps = props && isObj(props.pageProps) ? props.pageProps : null
  const product = pageProps && isObj(pageProps.product) ? pageProps.product : null
  if (!pageProps || !product) throw new ImportError('PARSE_FAILED', 'Product data not found on page')

  const title = asStr(product.title).trim()
  if (!title) throw new ImportError('PARSE_FAILED', 'Product title missing')

  // JSON-LD (image fallback)
  let ldImages: string[] = []
  $('script[type="application/ld+json"]').each((_, e) => {
    try {
      const j = JSON.parse($(e).text())
      const nodes = Array.isArray(j) ? j : [j]
      for (const n of nodes) {
        if (isObj(n) && n['@type'] === 'Product' && n.image) {
          const imgs = Array.isArray(n.image) ? n.image : [n.image]
          ldImages = ldImages.concat(imgs.map(absHttps).filter((x): x is string => !!x))
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  })

  // Images: only this product's own gallery (product.images) and its variants' images, deduped by URL
  // without query string; JSON-LD only when both are empty. Capped so a page can't flood the gallery.
  const rawVariants = Array.isArray(product.variants) ? product.variants : []
  const keyOf = (u: string) => u.split(/[?#]/)[0]
  const dedupe = (list: unknown[]) => {
    const out = new Map<string, string>()
    for (const u of list) {
      const a = absHttps(u)
      if (a && !out.has(keyOf(a))) out.set(keyOf(a), a)
    }
    return out
  }
  const own = dedupe(Array.isArray(product.images) ? product.images : [])
  const variantOnly = [...dedupe(rawVariants.map((rv) => (isObj(rv) ? rv.image : null)))].filter(([k]) => !own.has(k))
  let images: string[]
  if (own.size === 0 && variantOnly.length === 0) images = [...dedupe(ldImages).values()].slice(0, MAX_IMAGES)
  else {
    // keep variant images (variants point at them) and fill the rest with the gallery, in order
    const extra = variantOnly.slice(0, MAX_IMAGES).map(([, u]) => u)
    images = [...[...own.values()].slice(0, MAX_IMAGES - extra.length), ...extra]
  }
  const byKey = new Map(images.map((u) => [keyOf(u), u]))

  const variants: ImportedProduct['variants'] = []
  for (const rv of rawVariants) {
    if (!isObj(rv)) continue
    const sku = asStr(rv.sku).trim()
    const priceUsd = priceOf(rv.price) ?? priceOf(product.price)
    if (!sku || priceUsd === null) continue
    // Every option's chosen value, in order (e.g. Color + Bundle Choice -> "Space Black / Power Bank + Charger",
    // as anker.com names it); blanks and repeats are skipped. Using only the first option made bundles indistinguishable.
    const opts = Array.isArray(rv.options) ? rv.options : []
    const labels: string[] = []
    for (const o of opts) {
      const vals = isObj(o) && Array.isArray(o.values) ? o.values : []
      const l = isObj(vals[0]) ? asStr(vals[0].label).trim() : ''
      if (l && !labels.includes(l)) labels.push(l)
    }
    const label = labels.join(' / ')
    const rawImage = absHttps(rv.image)
    const imageUrl = rawImage ? byKey.get(keyOf(rawImage)) : undefined
    variants.push({
      sku,
      name: label || asStr(rv.title).trim() || sku,
      priceUsd,
      imageUrl,
      available: rv.availableForSale !== false,
    })
  }
  if (variants.length === 0) throw new ImportError('PARSE_FAILED', 'No variants found')

  // key features -> highlights + "What You Get" -> inTheBox
  const hideRaw =
    isObj(pageProps.metafields) && isObj(pageProps.metafields.infos) ? pageProps.metafields.infos.key_features_hideKey : null
  const hide = new Set(
    (Array.isArray(hideRaw) ? hideRaw : ['What You Get', 'Warranty Note', 'Note']).map((k) => asStr(k).trim().toLowerCase()),
  )
  hide.add('what you get')
  const mf = isObj(product.metafields) ? product.metafields : null
  const pi = mf && isObj(mf.productInfos) ? mf.productInfos : null
  const kf = pi && isObj(pi.key_features) ? pi.key_features : null
  const list = kf && Array.isArray(kf.list) ? kf.list : []
  const highlights: ImportedProduct['highlights'] = []
  let inTheBox: string[] = []
  for (const item of list) {
    if (!isObj(item)) continue
    const rawKey = asStr(item.key)
    const key = textOf(rawKey)
    const value = textOf(asStr(item.value))
    if (!key) continue
    if (key.toLowerCase() === 'what you get') {
      inTheBox = splitBox(textOf(asStr(item.value)))
      continue
    }
    if (hide.has(key.toLowerCase()) || /^note\b/i.test(key) || /<[a-z]/i.test(rawKey)) continue
    highlights.push({ title: key, body: value })
  }

  const descriptionHtml = asStr(product.descriptionHtml) || (asStr(product.description) ? `<p>${asStr(product.description)}</p>` : '')

  const handleFromUrl = (() => {
    try {
      return normalizeAnkerUrl(url).split('/').pop() ?? ''
    } catch {
      return ''
    }
  })()
  const handle = asStr(product.handle).trim() || handleFromUrl
  if (!handle) throw new ImportError('PARSE_FAILED', 'Product handle missing')

  return {
    sourceUrl: handleFromUrl ? `https://www.anker.com/products/${handleFromUrl}` : url,
    handle,
    title,
    descriptionHtml,
    images,
    highlights,
    inTheBox,
    specGroups: parseSpecs($),
    variants,
    ...parseOverview(isObj(pageProps.metafields) ? pageProps.metafields.components : null),
  }
}
