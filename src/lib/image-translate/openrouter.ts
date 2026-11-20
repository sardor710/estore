import type { AspectRatio } from './prompt'

/** Redraws an image from an edit prompt. */
export interface ImageEditor {
  edit(input: { bytes: Uint8Array; mime: string; prompt: string; aspectRatio: AspectRatio }): Promise<{ bytes: Uint8Array; costUsd: number }>
}

export class ImageEditError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ImageEditError'
  }
}

/** Tencent Hy Image 3.5: of the image models tried, the one that accepts an input image and keeps the layout. */
export const DEFAULT_IMAGE_MODEL = 'tencent/hy-image-v3.5-preview'
const ENDPOINT = 'https://openrouter.ai/api/v1/images'
const TIMEOUT_MS = 5 * 60_000

export const imageModel = () => (process.env.OPENROUTER_IMAGE_MODEL ?? '').trim() || DEFAULT_IMAGE_MODEL

type ImagesResponse = {
  data?: { b64_json?: string; url?: string; media_type?: string }[]
  usage?: { cost?: number }
  error?: { message?: string }
}

/** OpenRouter image endpoint (POST /api/v1/images, input image in `input_references`, output in data[0].b64_json). */
export class OpenRouterImageEditor implements ImageEditor {
  constructor(
    private apiKey: string,
    private model: string = imageModel(),
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async edit(input: { bytes: Uint8Array; mime: string; prompt: string; aspectRatio: AspectRatio }) {
    const body = {
      model: this.model,
      prompt: input.prompt,
      n: 1,
      aspect_ratio: input.aspectRatio,
      resolution: '2K',
      input_references: [
        { type: 'image_url', image_url: { url: `data:${input.mime};base64,${Buffer.from(input.bytes).toString('base64')}` } },
      ],
    }
    let res: Response
    try {
      res = await this.fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Zanko image translation' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (e) {
      throw new ImageEditError(`Image model request failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e })
    }
    const json = (await res.json().catch(() => ({}))) as ImagesResponse
    if (!res.ok) throw new ImageEditError(`Image model error ${res.status}: ${json.error?.message ?? res.statusText}`)
    const b64 = json.data?.[0]?.b64_json
    if (!b64) throw new ImageEditError('Image model returned no image')
    return { bytes: new Uint8Array(Buffer.from(b64, 'base64')), costUsd: Number(json.usage?.cost ?? 0) || 0 }
  }
}
