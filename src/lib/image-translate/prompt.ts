/** Pure helpers for image text translation: the text-block shape, the image-model prompt and the aspect ratio. */

export type ImageLocale = 'uz' | 'ru'
export const IMAGE_LOCALES: readonly ImageLocale[] = ['uz', 'ru']

/** One piece of English text found in an image, with where it is and its translations. */
export type TextBlock = { where: string; text: string; uz: string; ru: string }

const LANGUAGE_NAME: Record<ImageLocale, string> = {
  uz: 'Uzbek (Latin script)',
  ru: 'Russian',
}

const quote = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Edit instruction for the image model. An explicit numbered list of every text block, with its location and the exact
 * translation, is what makes the model replace all of them and spell them right; vague "translate the text" prompts
 * skip blocks and invent letters.
 */
export function buildEditPrompt(blocks: TextBlock[], locale: ImageLocale): string {
  const lang = LANGUAGE_NAME[locale]
  const lines = blocks.map((b, i) => `${i + 1}. ${quote(b.where)}: "${quote(b.text)}" -> «${quote(b[locale])}»`)
  return [
    'TEXT-ONLY EDIT of the attached product image. Reproduce the image exactly: same product, same composition, framing, crop, camera angle, lighting, colors, background, icons, logos and layout. The only change: translate the English captions into ' +
      lang +
      '.',
    '',
    `There are exactly ${blocks.length} English text block${blocks.length === 1 ? '' : 's'}. Replace EVERY one of them (all ${blocks.length}, do not skip any), keeping its position, font family, weight, color, alignment and approximate size. Spell the ${lang} text exactly as written, letter by letter:`,
    '',
    ...lines,
    '',
    'Do NOT change: brand names and logos (such as ANKER, soundcore, eufy), model numbers, numbers with units (such as 100W, 25,000mAh, 3 ft), any text or digits shown on device screens, the devices themselves, cables, hands, people, icons and charts. Do not add any new text. If a translated phrase is longer, use a slightly smaller font so it fits the same area; never cover the product.',
  ].join('\n')
}

/** Aspect ratios the image model accepts. */
export const ASPECT_RATIOS = ['1:1', '1:2', '1:4', '2:1', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '9:16', '16:9'] as const
export type AspectRatio = (typeof ASPECT_RATIOS)[number]

/** Supported ratio closest to width:height (compared on a log scale, so 2:1 and 1:2 are equally far from 1:1). */
export function pickAspectRatio(width: number, height: number): AspectRatio {
  const want = Math.log(width / height)
  let best: AspectRatio = '1:1'
  let bestDist = Infinity
  for (const r of ASPECT_RATIOS) {
    const [w, h] = r.split(':').map(Number)
    const d = Math.abs(Math.log(w / h) - want)
    if (d < bestDist) {
      best = r
      bestDist = d
    }
  }
  return best
}

/** Keeps only well-formed blocks with text in both languages; drops blocks whose translation equals the source. */
export function cleanBlocks(raw: unknown): TextBlock[] {
  if (!Array.isArray(raw)) return []
  const out: TextBlock[] = []
  for (const b of raw) {
    if (!b || typeof b !== 'object') continue
    const { where, text, uz, ru } = b as Record<string, unknown>
    if (typeof text !== 'string' || typeof uz !== 'string' || typeof ru !== 'string') continue
    const t = text.trim()
    if (!t || !uz.trim() || !ru.trim()) continue
    if (uz.trim() === t && ru.trim() === t) continue // nothing to translate (brand name, number)
    out.push({ where: typeof where === 'string' && where.trim() ? where.trim() : 'text', text: t, uz: uz.trim(), ru: ru.trim() })
  }
  return out
}
