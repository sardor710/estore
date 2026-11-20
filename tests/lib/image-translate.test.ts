import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

const TMP = mkdtempSync(join(tmpdir(), 'estore-imgtr-'))
process.env.UPLOADS_DIR = TMP

import { prisma } from '@/lib/db'
import { buildEditPrompt, cleanBlocks, pickAspectRatio, type TextBlock } from '@/lib/image-translate/prompt'
import {
  keepOriginalImage,
  localizeProductImages,
  processPending,
  productImageUrls,
  queueImageTranslations,
  redoImageTranslation,
  translatedImageMap,
  type Deps,
} from '@/lib/image-translate/service'
import { OpenRouterImageEditor } from '@/lib/image-translate/openrouter'
import { saveGeneratedImage } from '@/lib/uploads'

afterAll(() => rmSync(TMP, { recursive: true, force: true }))

const BLOCK: TextBlock = { where: 'top headline', text: 'Fast Charging', uz: 'Tez quvvatlash', ru: 'Быстрая зарядка' }

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#88aaff' } }).png().toBuffer()

function fakeDeps(opts: { blocks?: TextBlock[]; fail?: string; outSize?: [number, number] } = {}) {
  const calls = { read: 0, edit: [] as { prompt: string; aspectRatio: string }[] }
  const deps: Deps = {
    loadSource: async () => new Uint8Array(await png(1000, 1250)),
    reader: {
      async read() {
        calls.read++
        return opts.blocks ?? [BLOCK]
      },
    },
    editor: {
      async edit(input) {
        if (opts.fail) throw new Error(opts.fail)
        calls.edit.push({ prompt: input.prompt, aspectRatio: input.aspectRatio })
        const [w, h] = opts.outSize ?? [816, 1024]
        return { bytes: new Uint8Array(await png(w, h)), costUsd: 0.024 }
      },
    },
  }
  return { deps, calls }
}

describe('prompt helpers', () => {
  it('lists every block with its translation and count', () => {
    const p = buildEditPrompt([BLOCK, { where: 'footnote', text: 'Note:  small\nprint', uz: 'Izoh', ru: 'Примечание' }], 'ru')
    expect(p).toContain('exactly 2 English text blocks')
    expect(p).toContain('1. top headline: "Fast Charging" -> «Быстрая зарядка»')
    expect(p).toContain('2. footnote: "Note: small print" -> «Примечание»')
    expect(p).toContain('Russian')
    expect(buildEditPrompt([BLOCK], 'uz')).toContain('«Tez quvvatlash»')
  })

  it('picks the closest supported aspect ratio', () => {
    expect(pickAspectRatio(1000, 1250)).toBe('4:5')
    expect(pickAspectRatio(2000, 2000)).toBe('1:1')
    expect(pickAspectRatio(1920, 1080)).toBe('16:9')
    expect(pickAspectRatio(750, 1334)).toBe('9:16')
    expect(pickAspectRatio(2200, 1000)).toBe('2:1')
  })

  it('cleans model output', () => {
    expect(
      cleanBlocks([
        BLOCK,
        { where: 'logo', text: 'ANKER', uz: 'ANKER', ru: 'ANKER' },
        { text: 'x', uz: '', ru: 'y' },
        'junk',
        { text: 'Safe', uz: 'Xavfsiz', ru: 'Безопасно' },
      ]),
    ).toEqual([BLOCK, { where: 'text', text: 'Safe', uz: 'Xavfsiz', ru: 'Безопасно' }])
    expect(cleanBlocks(null)).toEqual([])
  })

  it('collects gallery and section images, deduplicated, without GIFs', () => {
    expect(
      productImageUrls({
        images: ['/uploads/a.jpg', 'https://x/b.png', '/uploads/a.jpg', 'https://x/c.gif?v=1'],
        sections: [{ image: 'https://x/d.jpg', imageMobile: 'https://x/e.jpg' }, { heading: {} }],
      }),
    ).toEqual(['/uploads/a.jpg', 'https://x/b.png', 'https://x/d.jpg', 'https://x/e.jpg'])
  })
})

describe('queue and worker', () => {
  beforeEach(() => {
    delete process.env.IMAGE_TRANSLATION_DAILY_LIMIT
  })

  it('queues uz and ru once per image', async () => {
    expect(await queueImageTranslations(['https://x/a.jpg', 'https://x/b.jpg'])).toBe(4)
    expect(await queueImageTranslations(['https://x/a.jpg'])).toBe(0)
    expect(await prisma.imageTranslation.count({ where: { status: 'PENDING' } })).toBe(4)
  })

  it('reads the text once, draws both languages and stores same-size webp copies', async () => {
    await queueImageTranslations(['https://x/a.jpg'])
    const { deps, calls } = fakeDeps()
    await processPending(deps)
    expect(calls.read).toBe(1)
    expect(calls.edit.map((c) => c.aspectRatio)).toEqual(['4:5', '4:5'])
    expect(calls.edit[0].prompt).toContain('«Tez quvvatlash»')
    expect(calls.edit[1].prompt).toContain('«Быстрая зарядка»')
    const rows = await prisma.imageTranslation.findMany({ orderBy: { locale: 'asc' } })
    expect(rows.map((r) => [r.locale, r.status])).toEqual([
      ['ru', 'DONE'],
      ['uz', 'DONE'],
    ])
    for (const r of rows) {
      expect(r.url).toMatch(/^\/uploads\/\d{4}\/\d{2}\/[0-9a-f]{32}\.webp$/)
      const file = join(TMP, r.url!.slice('/uploads/'.length))
      expect(existsSync(file)).toBe(true)
      const meta = await sharp(file).metadata()
      expect([meta.format, meta.width, meta.height]).toEqual(['webp', 1000, 1250])
      expect(r.costUsd).toBeCloseTo(0.024)
    }
  })

  it('marks images without text as NO_TEXT without calling the image model', async () => {
    await queueImageTranslations(['https://x/plain.jpg'])
    const { deps, calls } = fakeDeps({ blocks: [] })
    await processPending(deps)
    expect(calls.edit).toHaveLength(0)
    expect(calls.read).toBe(1)
    expect((await prisma.imageTranslation.findMany()).map((r) => r.status)).toEqual(['NO_TEXT', 'NO_TEXT'])
  })

  it('records failures and lets staff redo them', async () => {
    await queueImageTranslations(['https://x/a.jpg'])
    await processPending(fakeDeps({ fail: 'Image model error 502: busy' }).deps)
    const failed = await prisma.imageTranslation.findMany()
    expect(failed.every((r) => r.status === 'FAILED' && r.error === 'Image model error 502: busy')).toBe(true)

    await redoImageTranslation('https://x/a.jpg', 'uz')
    const { deps } = fakeDeps()
    await processPending(deps)
    const uz = await prisma.imageTranslation.findUnique({ where: { sourceUrl_locale: { sourceUrl: 'https://x/a.jpg', locale: 'uz' } } })
    const ru = await prisma.imageTranslation.findUnique({ where: { sourceUrl_locale: { sourceUrl: 'https://x/a.jpg', locale: 'ru' } } })
    expect([uz?.status, ru?.status]).toEqual(['DONE', 'FAILED'])
  })

  it('stops at the daily limit and leaves the rest waiting', async () => {
    process.env.IMAGE_TRANSLATION_DAILY_LIMIT = '1'
    await queueImageTranslations(['https://x/a.jpg'])
    await processPending(fakeDeps().deps)
    expect((await prisma.imageTranslation.findMany({ orderBy: { id: 'asc' } })).map((r) => r.status)).toEqual(['DONE', 'PENDING'])
  })

  it('resumes rows left RUNNING by a restart', async () => {
    await prisma.imageTranslation.create({ data: { sourceUrl: 'https://x/a.jpg', locale: 'uz', status: 'RUNNING' } })
    await processPending(fakeDeps().deps)
    expect((await prisma.imageTranslation.findFirst())?.status).toBe('DONE')
  })
})

describe('storefront swap', () => {
  const product = {
    images: ['https://x/a.jpg', 'https://x/b.jpg'],
    sections: [{ image: 'https://x/a.jpg', imageMobile: 'https://x/m.jpg' }, {}],
  }

  beforeEach(async () => {
    await prisma.imageTranslation.createMany({
      data: [
        { sourceUrl: 'https://x/a.jpg', locale: 'uz', status: 'DONE', url: '/uploads/2026/11/a-uz.webp' },
        { sourceUrl: 'https://x/a.jpg', locale: 'ru', status: 'FAILED' },
        { sourceUrl: 'https://x/m.jpg', locale: 'uz', status: 'DONE', url: '/uploads/2026/11/m-uz.webp' },
      ],
    })
  })

  it('swaps DONE copies for uz only', async () => {
    const uz = await localizeProductImages(product, 'uz')
    expect(uz.images).toEqual(['/uploads/2026/11/a-uz.webp', 'https://x/b.jpg'])
    expect(uz.sections[0]).toEqual({ image: '/uploads/2026/11/a-uz.webp', imageMobile: '/uploads/2026/11/m-uz.webp' })
    expect(uz.sections[1]).toEqual({ image: undefined, imageMobile: undefined })
    expect(await localizeProductImages(product, 'ru')).toBe(product)
    expect(await localizeProductImages(product, 'en')).toBe(product)
  })

  it('shows the original again after "use original"', async () => {
    await keepOriginalImage('https://x/a.jpg', 'uz')
    expect([...(await translatedImageMap(['https://x/a.jpg'], 'uz')).keys()]).toEqual([])
    await processPending(fakeDeps().deps) // ORIGINAL is never redone automatically
    expect((await prisma.imageTranslation.findUnique({ where: { sourceUrl_locale: { sourceUrl: 'https://x/a.jpg', locale: 'uz' } } }))?.status).toBe('ORIGINAL')
  })
})

describe('OpenRouterImageEditor', () => {
  it('sends the image as an input reference and decodes the reply', async () => {
    let sent: { url: string; body: Record<string, unknown>; auth: string } | null = null
    const fakeFetch = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).Authorization }
      return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('img').toString('base64') }], usage: { cost: 0.024 } }), { status: 200 })
    }) as unknown as typeof fetch
    const out = await new OpenRouterImageEditor('k1', 'tencent/hy-image-v3.5-preview', fakeFetch).edit({
      bytes: new Uint8Array([1, 2, 3]),
      mime: 'image/jpeg',
      prompt: 'p',
      aspectRatio: '4:5',
    })
    expect(Buffer.from(out.bytes).toString()).toBe('img')
    expect(out.costUsd).toBe(0.024)
    expect(sent!.url).toBe('https://openrouter.ai/api/v1/images')
    expect(sent!.auth).toBe('Bearer k1')
    expect(sent!.body).toMatchObject({
      model: 'tencent/hy-image-v3.5-preview',
      prompt: 'p',
      aspect_ratio: '4:5',
      input_references: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AQID' } }],
    })
  })

  it('reports API errors', async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ error: { message: 'Insufficient credits' } }), { status: 402 })) as unknown as typeof fetch
    await expect(
      new OpenRouterImageEditor('k', 'm', fakeFetch).edit({ bytes: new Uint8Array([1]), mime: 'image/jpeg', prompt: 'p', aspectRatio: '1:1' }),
    ).rejects.toThrow('Image model error 402: Insufficient credits')
  })
})

describe('saveGeneratedImage', () => {
  it('refuses bytes that are not the declared type', async () => {
    await expect(saveGeneratedImage(new Uint8Array(await png(4, 4)), 'webp')).rejects.toThrow('not a webp')
  })
})

describe('OpenRouterTextReader', () => {
  it('asks a vision model for JSON blocks and cleans them', async () => {
    const { OpenRouterTextReader } = await import('@/lib/image-translate/detect')
    let body: Record<string, unknown> = {}
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body))
      const content = JSON.stringify({ blocks: [BLOCK, { where: 'logo', text: 'ANKER', uz: 'ANKER', ru: 'ANKER' }] })
      return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }), { status: 200 })
    }) as unknown as typeof fetch
    const blocks = await new OpenRouterTextReader('k', 'anthropic/claude-haiku-5.5', fakeFetch).read({ bytes: new Uint8Array([1]), mime: 'image/jpeg' })
    expect(blocks).toEqual([BLOCK])
    expect(body.model).toBe('anthropic/claude-haiku-5.5')
    expect(JSON.stringify(body.messages)).toContain('data:image/jpeg;base64,AQ==')
  })

  it('reports a cut-off reply', async () => {
    const { OpenRouterTextReader } = await import('@/lib/image-translate/detect')
    const fakeFetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"blo' }, finish_reason: 'length' }] }), { status: 200 })) as unknown as typeof fetch
    await expect(new OpenRouterTextReader('k', 'm', fakeFetch).read({ bytes: new Uint8Array([1]), mime: 'image/jpeg' })).rejects.toThrow('cut off')
  })
})
