import Anthropic from '@anthropic-ai/sdk'
import { TranslationError, type TargetLocale, type Translator } from './types'

export const TRANSLATION_MODEL = 'claude-haiku-5-5'
export const MAX_STRINGS_PER_REQUEST = 40
/**
 * Soft cap on input characters per request. Output (Cyrillic/Uzbek is token-heavier than English, plus the
 * model's thinking, which also counts against max_tokens) must fit MAX_OUTPUT_TOKENS with a wide margin.
 */
const MAX_CHARS_PER_REQUEST = 7_000
/** Below the SDK's non-streaming ceiling (~21.3k tokens for a 10-minute request), so no streaming is needed. */
const MAX_OUTPUT_TOKENS = 20_000
/** Guards the split-and-retry recursion. */
const MAX_SPLIT_DEPTH = 12

/** A response that a smaller request may fix (cut off, invalid JSON, wrong count). */
class Retryable extends TranslationError {}

/**
 * Splits HTML into its top-level nodes (whitespace between them stays attached), e.g.
 * "<p>a</p> <ul>..</ul>" -> ["<p>a</p> ", "<ul>..</ul>"]. Plain text falls back to paragraphs.
 */
export function splitTopLevelHtml(html: string): string[] {
  const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
  const parts: string[] = []
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g
  let depth = 0
  let start = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const [, closing, tag, selfClosing] = m
    const isVoid = VOID.has(tag.toLowerCase()) || selfClosing === '/'
    if (closing) depth = Math.max(0, depth - 1)
    else if (!isVoid) depth++
    if (depth === 0) {
      let end = re.lastIndex
      while (end < html.length && /\s/.test(html[end])) end++
      if (end > start) parts.push(html.slice(start, end))
      start = end
      re.lastIndex = end
    }
  }
  if (start < html.length) parts.push(html.slice(start))
  if (parts.length > 1) return parts
  const paras = html.split(/(?<=\n\s*\n)/)
  return paras.length > 1 ? paras : [html]
}

const LANGUAGE: Record<TargetLocale, string> = {
  uz: 'Uzbek, written in the Latin script (not Cyrillic)',
  ru: 'Russian',
}

function systemPrompt(to: TargetLocale): string {
  return [
    'You translate e-commerce product copy for an Uzbek consumer-electronics shop (chargers, power banks, audio, smart gadgets) from English.',
    `Target language: ${LANGUAGE[to]}.`,
    to === 'uz'
      ? 'Uzbek rules: use the modern Latin alphabet with the modifier letter ʻ (U+02BB) in oʻ and gʻ (e.g. oʻzbek, gʻoya) and ’ (U+2019) for the tutuq belgisi where appropriate (e.g. ma’lumot). Never use the ASCII apostrophe for oʻ/gʻ.'
      : 'Use natural, idiomatic Russian suitable for an online shop.',
    'The user message is a JSON array of strings. Translate each string independently and return them in the same order.',
    'Keep HTML tags and attributes exactly as they are and translate only the text between tags. Keep brand names (Anker, soundcore, ...), model numbers, SKUs, units (W, mAh, mm, g, oz, ...), numbers, URLs and {placeholders} untranslated and unchanged. Keep standard technical terms such as USB-C, GaN, Bluetooth, PD as is.',
    'Do not add explanations, do not merge or split strings, and do not translate an empty string into anything but an empty string.',
    'Respond with JSON only: {"translations": [...]} where the array has exactly as many strings as the input array.',
  ].join('\n')
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: { translations: { type: 'array', items: { type: 'string' } } },
  required: ['translations'],
  additionalProperties: false,
} as const

/** Split into batches of at most MAX_STRINGS_PER_REQUEST strings (and ~MAX_CHARS_PER_REQUEST chars), keeping order. */
export function toBatches(texts: string[]): string[][] {
  const batches: string[][] = []
  let cur: string[] = []
  let chars = 0
  for (const t of texts) {
    if (cur.length > 0 && (cur.length >= MAX_STRINGS_PER_REQUEST || chars + t.length > MAX_CHARS_PER_REQUEST)) {
      batches.push(cur)
      cur = []
      chars = 0
    }
    cur.push(t)
    chars += t.length
  }
  if (cur.length > 0) batches.push(cur)
  return batches
}

type MessagesClient = Pick<Anthropic, 'messages'>

export class ClaudeTranslator implements Translator {
  private client: MessagesClient

  constructor(opts: { apiKey?: string; client?: MessagesClient } = {}) {
    // SDK default retries (2x on 408/409/429/5xx and connection errors) are kept.
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey })
  }

  async translate(texts: string[], to: TargetLocale): Promise<string[]> {
    const out: string[] = []
    for (const batch of toBatches(texts)) out.push(...(await this.translateAdaptive(batch, to, 0)))
    return out
  }

  /** Translate a batch; when the reply is cut off or malformed, split it in half (or split one long HTML string) and retry. */
  private async translateAdaptive(batch: string[], to: TargetLocale, depth: number): Promise<string[]> {
    try {
      return await this.translateBatch(batch, to)
    } catch (e) {
      if (!(e instanceof Retryable) || depth >= MAX_SPLIT_DEPTH) throw e
      if (batch.length > 1) {
        const mid = Math.floor(batch.length / 2)
        return [...(await this.translateAdaptive(batch.slice(0, mid), to, depth + 1)), ...(await this.translateAdaptive(batch.slice(mid), to, depth + 1))]
      }
      const parts = splitTopLevelHtml(batch[0])
      if (parts.length < 2) throw new TranslationError(`${e.message}; the text is too long to translate in one piece and cannot be split further`, { cause: e })
      const mid = Math.floor(parts.length / 2)
      const halves = [parts.slice(0, mid).join(''), parts.slice(mid).join('')]
      const out = await this.translateAdaptive(halves, to, depth + 1)
      return [out.join('')]
    }
  }

  private async translateBatch(batch: string[], to: TargetLocale): Promise<string[]> {
    let resp
    try {
      resp = await this.client.messages.create({
        model: TRANSLATION_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt(to),
        output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        messages: [{ role: 'user', content: JSON.stringify(batch) }],
      })
    } catch (e) {
      throw new TranslationError(`Claude request failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e })
    }
    if (resp.stop_reason === 'refusal') throw new TranslationError('Claude refused to translate this content')
    if (resp.stop_reason === 'max_tokens') throw new Retryable('Claude response was cut off (max_tokens)')
    const text = resp.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      throw new Retryable('Claude returned invalid JSON', { cause: e })
    }
    const arr = (parsed as { translations?: unknown } | null)?.translations
    if (!Array.isArray(arr) || arr.length !== batch.length || arr.some((s) => typeof s !== 'string')) {
      throw new Retryable(
        `Claude returned ${Array.isArray(arr) ? arr.length : 'no'} translations for ${batch.length} strings`,
      )
    }
    return arr as string[]
  }
}

export function isTranslationConfigured(): boolean {
  return (process.env.ANTHROPIC_API_KEY ?? '').trim() !== ''
}

/** ClaudeTranslator when ANTHROPIC_API_KEY is set, otherwise null (callers report "not configured"). */
export function getTranslator(): Translator | null {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim()
  return apiKey ? new ClaudeTranslator({ apiKey }) : null
}
