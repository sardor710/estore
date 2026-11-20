import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { resolveUploadPath, saveGeneratedImage } from '@/lib/uploads'
import { OpenRouterTextReader, type TextReader } from './detect'
import { OpenRouterImageEditor, type ImageEditor } from './openrouter'
import { IMAGE_LOCALES, buildEditPrompt, cleanBlocks, pickAspectRatio, type ImageLocale, type TextBlock } from './prompt'

/**
 * Translates the English text inside product images into uz and ru with an AI image model.
 * Rows in ImageTranslation form a queue: PENDING rows are processed one at a time in this process
 * (read the text with a vision model, redraw with the image model, store the copy under /uploads).
 * The storefront shows a DONE copy on /uz and /ru; /en and every other status keep the original.
 */

export type ImageTranslationStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'NO_TEXT' | 'FAILED' | 'ORIGINAL'

export type Deps = { reader: TextReader; editor: ImageEditor; loadSource: (url: string) => Promise<Uint8Array> }

const MAX_SOURCE_BYTES = 20 * 1024 * 1024
/** Long side sent to the text reader (vision models downsize larger images anyway) and to the image model. */
const READ_MAX_SIDE = 1568
const EDIT_MAX_SIDE = 2048
/** Stored copies are never wider/taller than this. */
const OUTPUT_MAX_SIDE = 2400

export function isImageTranslationConfigured(): boolean {
  return (process.env.OPENROUTER_API_KEY ?? '').trim() !== ''
}

/** Image edits allowed per UTC day (cost guard); IMAGE_TRANSLATION_DAILY_LIMIT overrides, 0 disables the feature. */
export function dailyLimit(): number {
  const n = Number(process.env.IMAGE_TRANSLATION_DAILY_LIMIT)
  return Number.isFinite(n) && n >= 0 && process.env.IMAGE_TRANSLATION_DAILY_LIMIT?.trim() ? Math.floor(n) : 300
}

function defaultDeps(): Deps | null {
  if (!isImageTranslationConfigured()) return null
  return {
    reader: new OpenRouterTextReader(process.env.OPENROUTER_API_KEY!.trim()),
    editor: new OpenRouterImageEditor(process.env.OPENROUTER_API_KEY!.trim()),
    loadSource,
  }
}

/** Local upload or an https image, at most 20 MB. */
export async function loadSource(url: string): Promise<Uint8Array> {
  if (url.startsWith('/uploads/')) {
    const file = resolveUploadPath(url.slice('/uploads/'.length).split('?')[0].split('/'))
    if (!file) throw new Error('Not a valid upload path')
    return new Uint8Array(await readFile(file))
  }
  if (!/^https:\/\//i.test(url)) throw new Error('Only https images and uploads can be translated')
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: 'follow' })
  if (!res.ok) throw new Error(`Could not download the image (HTTP ${res.status})`)
  const buf = new Uint8Array(await res.arrayBuffer())
  if (buf.length > MAX_SOURCE_BYTES) throw new Error('Image is larger than 20 MB')
  return buf
}

/** Gallery images plus overview/section images (desktop and mobile), deduplicated, GIFs skipped. */
export function productImageUrls(p: { images: unknown; sections: unknown }): string[] {
  const urls: string[] = []
  if (Array.isArray(p.images)) for (const u of p.images) if (typeof u === 'string') urls.push(u)
  if (Array.isArray(p.sections)) {
    for (const s of p.sections) {
      if (!s || typeof s !== 'object') continue
      const { image, imageMobile } = s as { image?: unknown; imageMobile?: unknown }
      if (typeof image === 'string') urls.push(image)
      if (typeof imageMobile === 'string') urls.push(imageMobile)
    }
  }
  return [...new Set(urls.map((u) => u.trim()).filter((u) => u && !/\.gif(\?|$)/i.test(u)))]
}

/** Adds PENDING rows for (url, locale) pairs that have none yet; returns how many were added. Never redoes existing rows. */
export async function queueImageTranslations(urls: string[]): Promise<number> {
  if (!urls.length) return 0
  const existing = await prisma.imageTranslation.findMany({ where: { sourceUrl: { in: urls } }, select: { sourceUrl: true, locale: true } })
  const have = new Set(existing.map((r) => `${r.locale} ${r.sourceUrl}`))
  const data = urls.flatMap((sourceUrl) => IMAGE_LOCALES.filter((locale) => !have.has(`${locale} ${sourceUrl}`)).map((locale) => ({ sourceUrl, locale })))
  if (!data.length) return 0
  for (const row of data) {
    await prisma.imageTranslation.upsert({ where: { sourceUrl_locale: row }, create: row, update: {} })
  }
  return data.length
}

/** Queue every image of a product and start processing in the background (no-op when not configured). */
export async function queueProductImages(productId: number): Promise<number> {
  if (!isImageTranslationConfigured() || dailyLimit() === 0) return 0
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { images: true, sections: true } })
  if (!p) return 0
  const added = await queueImageTranslations(productImageUrls(p))
  kickImageTranslations()
  return added
}

let running: Promise<void> | null = null

/** Starts the background worker unless it is already running. Safe to call often. */
export function kickImageTranslations(deps?: Deps): Promise<void> | null {
  if (running) return running
  const d = deps ?? defaultDeps()
  if (!d) return null
  running = processPending(d)
    .catch((e) => console.error('[image-translate]', e))
    .finally(() => {
      running = null
    })
  return running
}

function startOfUtcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** Processes PENDING rows oldest first until none are left or the daily limit is reached. */
export async function processPending(deps: Deps): Promise<void> {
  // Only this process works the queue: anything still RUNNING was cut off by a restart.
  await prisma.imageTranslation.updateMany({ where: { status: 'RUNNING' }, data: { status: 'PENDING' } })
  for (;;) {
    const doneToday = await prisma.imageTranslation.count({ where: { status: 'DONE', updatedAt: { gte: startOfUtcDay() } } })
    if (doneToday >= dailyLimit()) return
    const next = await prisma.imageTranslation.findFirst({ where: { status: 'PENDING' }, orderBy: { id: 'asc' } })
    if (!next) return
    const claimed = await prisma.imageTranslation.updateMany({ where: { id: next.id, status: 'PENDING' }, data: { status: 'RUNNING', error: null } })
    if (claimed.count === 0) continue
    await translateOne(next.id, next.sourceUrl, next.locale as ImageLocale, deps)
  }
}

async function translateOne(id: number, sourceUrl: string, locale: ImageLocale, deps: Deps): Promise<void> {
  try {
    const source = await deps.loadSource(sourceUrl)
    const img = sharp(source, { failOn: 'none' }).rotate()
    const meta = await img.metadata()
    const width = meta.autoOrient?.width ?? meta.width
    const height = meta.autoOrient?.height ?? meta.height
    if (!width || !height) throw new Error('Not a readable image')

    const blocks = await textBlocksFor(sourceUrl, source, deps)
    if (!blocks.length) {
      await prisma.imageTranslation.update({ where: { id }, data: { status: 'NO_TEXT', texts: [], url: null } })
      return
    }

    const editInput = await sharp(source, { failOn: 'none' })
      .rotate()
      .resize({ width: EDIT_MAX_SIDE, height: EDIT_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 92 })
      .toBuffer()
    const out = await deps.editor.edit({
      bytes: new Uint8Array(editInput),
      mime: 'image/jpeg',
      prompt: buildEditPrompt(blocks, locale),
      aspectRatio: pickAspectRatio(width, height),
    })

    // Same shape as the original so the gallery and banners do not jump between languages.
    const scale = Math.min(1, OUTPUT_MAX_SIDE / Math.max(width, height))
    const finalBytes = await sharp(Buffer.from(out.bytes), { failOn: 'none' })
      .resize({ width: Math.round(width * scale), height: Math.round(height * scale), fit: 'cover' })
      .webp({ quality: 86 })
      .toBuffer()
    const url = await saveGeneratedImage(new Uint8Array(finalBytes), 'webp')
    await prisma.imageTranslation.update({ where: { id }, data: { status: 'DONE', url, costUsd: { increment: out.costUsd }, error: null } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await prisma.imageTranslation.update({ where: { id }, data: { status: 'FAILED', error: msg.slice(0, 500) } })
  }
}

/** Text blocks of a source image: reused from a sibling locale row when already read, otherwise read once and stored on all rows. */
async function textBlocksFor(sourceUrl: string, source: Uint8Array, deps: Deps): Promise<TextBlock[]> {
  const known = await prisma.imageTranslation.findFirst({ where: { sourceUrl, NOT: { texts: { equals: Prisma.DbNull } } }, select: { texts: true } })
  if (known?.texts != null) return cleanBlocks(known.texts)
  const small = await sharp(source, { failOn: 'none' })
    .rotate()
    .resize({ width: READ_MAX_SIDE, height: READ_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 88 })
    .toBuffer()
  const blocks = await deps.reader.read({ bytes: new Uint8Array(small), mime: 'image/jpeg' })
  await prisma.imageTranslation.updateMany({ where: { sourceUrl }, data: { texts: blocks } })
  return blocks
}

// ---------- storefront ----------

/** sourceUrl -> translated copy for the locale (DONE rows only). Empty for en. */
export async function translatedImageMap(urls: string[], locale: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!urls.length || !(IMAGE_LOCALES as readonly string[]).includes(locale)) return map
  try {
    const rows = await prisma.imageTranslation.findMany({ where: { sourceUrl: { in: urls }, locale, status: 'DONE' }, select: { sourceUrl: true, url: true } })
    for (const r of rows) if (r.url) map.set(r.sourceUrl, r.url)
  } catch {
    // The storefront must never fail because of translated images: show the originals.
  }
  return map
}

/** The product with its gallery and section images swapped for the locale's translated copies where they exist. */
export async function localizeProductImages<P extends { images: string[]; sections: { image?: string; imageMobile?: string }[] }>(
  product: P,
  locale: string,
): Promise<P> {
  const map = await translatedImageMap(productImageUrls(product), locale)
  if (!map.size) return product
  const swap = (u: string | undefined) => (u ? (map.get(u) ?? u) : u)
  return {
    ...product,
    images: product.images.map((u) => map.get(u) ?? u),
    sections: product.sections.map((s) => ({ ...s, image: swap(s.image), imageMobile: swap(s.imageMobile) })),
  }
}

// ---------- admin ----------

export type ImageTranslationRow = {
  sourceUrl: string
  locale: ImageLocale
  status: ImageTranslationStatus
  url: string | null
  error: string | null
  texts: TextBlock[]
}

export async function imageTranslationsFor(productId: number): Promise<{ urls: string[]; rows: ImageTranslationRow[]; configured: boolean }> {
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { images: true, sections: true } })
  const urls = p ? productImageUrls(p) : []
  const rows = urls.length ? await prisma.imageTranslation.findMany({ where: { sourceUrl: { in: urls } }, orderBy: { id: 'asc' } }) : []
  if (rows.some((r) => r.status === 'PENDING')) kickImageTranslations()
  return {
    urls,
    configured: isImageTranslationConfigured(),
    rows: rows.map((r) => ({
      sourceUrl: r.sourceUrl,
      locale: r.locale as ImageLocale,
      status: r.status as ImageTranslationStatus,
      url: r.url,
      error: r.error,
      texts: cleanBlocks(r.texts),
    })),
  }
}

/** Redo one translation. `reread` also forgets the text read from the image (for when the reading was wrong). */
export async function redoImageTranslation(sourceUrl: string, locale: ImageLocale, opts: { reread?: boolean } = {}): Promise<void> {
  if (opts.reread) await prisma.imageTranslation.updateMany({ where: { sourceUrl }, data: { texts: Prisma.DbNull } })
  await prisma.imageTranslation.upsert({
    where: { sourceUrl_locale: { sourceUrl, locale } },
    create: { sourceUrl, locale },
    update: { status: 'PENDING', error: null },
  })
  kickImageTranslations()
}

/** Show the original image for this locale (a bad redraw); it is not redone automatically. */
export async function keepOriginalImage(sourceUrl: string, locale: ImageLocale): Promise<void> {
  await prisma.imageTranslation.upsert({
    where: { sourceUrl_locale: { sourceUrl, locale } },
    create: { sourceUrl, locale, status: 'ORIGINAL' },
    update: { status: 'ORIGINAL', url: null, error: null },
  })
}
