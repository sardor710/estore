import { cleanBlocks, type TextBlock } from './prompt'

/** Reads the English text in an image and translates it; [] when the image has no text worth translating. */
export interface TextReader {
  read(image: { bytes: Uint8Array; mime: string }): Promise<TextBlock[]>
}

export class ImageTextError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ImageTextError'
  }
}

const SYSTEM = [
  'You read the marketing text printed on product images of an Uzbek consumer-electronics shop (chargers, power banks, audio, smart gadgets) and translate it from English.',
  'List every English caption, headline, label, badge text and footnote that is part of the graphic design, in reading order (top to bottom, left to right).',
  'Skip: text that is physically on the product or its screen (digits, UI labels, printed logos), brand names and logos on their own (Anker, soundcore, eufy, ...), model numbers, and text that is only numbers and units (100W, 25,000mAh). Inside a caption, keep those untranslated.',
  'A headline that wraps over several lines in the same style is ONE block; lines in different sizes or styles (e.g. small text above and below a big number in a badge) are SEPARATE blocks, each translated on its own. A multi-line headline is ONE block. Give each block a short location ("top headline", "left card title", "badge in top-left corner", "bottom footnote").',
  'Translate each block into Russian (natural shop Russian) and Uzbek in the Latin script. Uzbek rules: use the modifier letter ʻ (U+02BB) in oʻ and gʻ and ’ (U+2019) for the tutuq belgisi; never the ASCII apostrophe. Keep units (W, mAh, ft), numbers and technical terms (USB-C, GaN, PD, Qi2) unchanged. Keep translations about as short as the English.',
  'If the image has no such English text, return an empty list.',
  'Respond with JSON only.',
].join('\n')

const SCHEMA = {
  type: 'object',
  properties: {
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { where: { type: 'string' }, text: { type: 'string' }, uz: { type: 'string' }, ru: { type: 'string' } },
        required: ['where', 'text', 'uz', 'ru'],
        additionalProperties: false,
      },
    },
  },
  required: ['blocks'],
  additionalProperties: false,
} as const

/** Vision model that reads and translates the text (through OpenRouter, so one key runs the whole feature). */
export const DEFAULT_READER_MODEL = 'anthropic/claude-haiku-5.5'
export const readerModel = () => (process.env.OPENROUTER_READER_MODEL ?? '').trim() || DEFAULT_READER_MODEL

type ChatResponse = {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[]
  error?: { message?: string }
}

export class OpenRouterTextReader implements TextReader {
  constructor(
    private apiKey: string,
    private model: string = readerModel(),
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async read(image: { bytes: Uint8Array; mime: string }): Promise<TextBlock[]> {
    const body = {
      model: this.model,
      max_tokens: 8000,
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: 'image_text', strict: true, schema: SCHEMA } },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${image.mime};base64,${Buffer.from(image.bytes).toString('base64')}` } },
            { type: 'text', text: 'List and translate the English text blocks in this image.' },
          ],
        },
      ],
    }
    let res: Response
    try {
      res = await this.fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Zanko image translation' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      })
    } catch (e) {
      throw new ImageTextError(`Reading the image text failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e })
    }
    const json = (await res.json().catch(() => ({}))) as ChatResponse
    if (!res.ok) throw new ImageTextError(`Reading the image text failed (${res.status}): ${json.error?.message ?? res.statusText}`)
    const choice = json.choices?.[0]
    if (choice?.message?.refusal) throw new ImageTextError('The model refused to read this image')
    if (choice?.finish_reason === 'length') throw new ImageTextError('The reply was cut off while reading the image')
    const text = (choice?.message?.content ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
    try {
      return cleanBlocks((JSON.parse(text) as { blocks?: unknown }).blocks)
    } catch (e) {
      throw new ImageTextError('The model returned invalid JSON for the image text', { cause: e })
    }
  }
}
