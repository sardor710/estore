import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { CONTENT_TYPES, resolveUploadPath, type ImageExt } from '@/lib/uploads'

export const runtime = 'nodejs'

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  const file = resolveUploadPath(path)
  if (!file) return new Response('Not found', { status: 404 })
  let data: Buffer
  try {
    data = await readFile(file)
  } catch {
    return new Response('Not found', { status: 404 })
  }
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': CONTENT_TYPES[extname(file).slice(1) as ImageExt],
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
