import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { extname } from 'node:path'
import { CONTENT_TYPES, resolveUploadPath, type MediaExt } from '@/lib/uploads'

export const runtime = 'nodejs'

const notFound = () => new Response('Not found', { status: 404 })

/** `bytes=a-b` / `bytes=a-` / `bytes=-n` -> inclusive [start, end] within size, 'bad' when unsatisfiable, null when absent. */
function parseRange(header: string | null, size: number): [number, number] | 'bad' | null {
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null
  if (!m || (!m[1] && !m[2])) return null
  let start: number
  let end: number
  if (!m[1]) {
    start = Math.max(0, size - Number(m[2]))
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  }
  return start > end || start >= size ? 'bad' : [start, end]
}

/** Serves stored uploads. Byte ranges are supported so videos play (and seek) in Safari and Telegram's in-app browser. */
export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  const file = resolveUploadPath(path)
  if (!file) return notFound()
  let size: number
  try {
    const st = await stat(file)
    if (!st.isFile()) return notFound()
    size = st.size
  } catch {
    return notFound()
  }
  const headers: Record<string, string> = {
    'Content-Type': CONTENT_TYPES[extname(file).slice(1) as MediaExt],
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
  }
  const range = parseRange(req.headers.get('range'), size)
  if (range === 'bad') return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } })
  const [start, end] = range ?? [0, size - 1]
  const length = size === 0 ? 0 : end - start + 1
  const body =
    length === 0 ? null : (Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream<Uint8Array>)
  return new Response(body, {
    status: range ? 206 : 200,
    headers: { ...headers, 'Content-Length': String(length), ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) },
  })
}
