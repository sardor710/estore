import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

/** Storage root; `UPLOADS_DIR` overrides it (tests use a temp dir). Read lazily on every call. */
export const uploadsDir = () => process.env.UPLOADS_DIR || join(process.cwd(), 'uploads')
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export type ImageExt = 'jpg' | 'png' | 'webp' | 'gif'

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v)

/** Detects the image type from magic bytes only; the file name and declared MIME type are never trusted. */
export function sniffImage(b: Uint8Array): ImageExt | null {
  if (b.length < 12) return null
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpg'
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38]) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'gif'
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
  return null
}

export const CONTENT_TYPES: Record<ImageExt, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

export async function saveUpload(file: File, now: Date = new Date()): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'File is larger than 5 MB' }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, error: 'File is larger than 5 MB' }
  const ext = sniffImage(bytes)
  if (!ext) return { ok: false, error: 'Only JPG, PNG, WEBP and GIF images are allowed' }
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const name = `${randomBytes(16).toString('hex')}.${ext}`
  const dir = join(uploadsDir(), yyyy, mm)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, name), bytes)
  return { ok: true, url: `/uploads/${yyyy}/${mm}/${name}` }
}

const SEG = /^(\d{4})\/(0[1-9]|1[0-2])\/[A-Za-z0-9_-]{1,64}\.(jpg|png|webp|gif)$/

/** Maps URL segments under /uploads/ to an absolute file path, or null unless strictly `YYYY/MM/<hex>.<ext>`. */
export function resolveUploadPath(segments: string[]): string | null {
  if (segments.length !== 3) return null
  const rel = segments.join('/')
  if (!SEG.test(rel)) return null
  const base = resolve(uploadsDir())
  const full = resolve(base, ...segments)
  return full.startsWith(base + sep) ? full : null
}
