// Client-safe: the image uploader sends files one per request through the existing endpoint, a few at a time.

export type FileLike = { name: string; type: string; size: number }
export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error'

const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** Same limits as POST /api/admin/uploads, checked before sending. null = OK. */
export function checkImageFile(f: FileLike): string | null {
  if (!TYPES.has(f.type)) return 'Not a JPG, PNG, WEBP or GIF'
  if (f.size > MAX_IMAGE_BYTES) return 'Larger than 5 MB'
  return null
}

/**
 * Uploads every acceptable file with at most `concurrency` requests in flight. A failure only affects its own file.
 * `urls` are the successful uploads in selection order; `errors` follow selection order too.
 */
export async function uploadAll<F extends FileLike>(
  files: F[],
  upload: (f: F) => Promise<string>,
  opts: { concurrency?: number; onStatus?: (index: number, s: UploadStatus, detail?: string) => void } = {},
): Promise<{ urls: string[]; errors: { name: string; message: string }[] }> {
  const limit = Math.max(1, opts.concurrency ?? 3)
  const results: ({ url: string } | { error: string } | null)[] = files.map(() => null)
  const pending: number[] = []
  files.forEach((f, i) => {
    const bad = checkImageFile(f)
    if (bad) {
      results[i] = { error: bad }
      opts.onStatus?.(i, 'error', bad)
    } else {
      pending.push(i)
      opts.onStatus?.(i, 'queued')
    }
  })

  let next = 0
  async function worker() {
    while (next < pending.length) {
      const i = pending[next++]
      opts.onStatus?.(i, 'uploading')
      try {
        const url = await upload(files[i])
        results[i] = { url }
        opts.onStatus?.(i, 'done')
      } catch (e) {
        const message = e instanceof Error && e.message ? e.message : 'Upload failed'
        results[i] = { error: message }
        opts.onStatus?.(i, 'error', message)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, pending.length) }, worker))

  const urls: string[] = []
  const errors: { name: string; message: string }[] = []
  results.forEach((r, i) => {
    if (r && 'url' in r) urls.push(r.url)
    else if (r) errors.push({ name: files[i].name, message: r.error })
  })
  return { urls, errors }
}
