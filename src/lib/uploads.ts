import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

/** Storage root; `UPLOADS_DIR` overrides it (tests use a temp dir). Read lazily on every call. */
export const uploadsDir = () => process.env.UPLOADS_DIR || join(process.cwd(), 'uploads')
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

import { UPLOAD_PATH_RE } from './upload-path'

export { UPLOAD_PATH_RE }

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

export type MediaExt = ImageExt | 'mp4'

export const CONTENT_TYPES: Record<MediaExt, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
}

/** MP4 (ISO base media, `ftyp` box first). QuickTime `.mov` (brand `qt  `) is refused: Telegram plays MP4 only. */
export function sniffMp4(b: Uint8Array): boolean {
  if (b.length < 12 || !startsWith(b, [0x66, 0x74, 0x79, 0x70], 4)) return false
  return !startsWith(b, [0x71, 0x74, 0x20, 0x20], 8)
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

/** Stores bytes the server produced itself (e.g. a translated image) as a new upload; returns its URL. */
export async function saveGeneratedImage(bytes: Uint8Array, ext: ImageExt, now: Date = new Date()): Promise<string> {
  if (sniffImage(bytes) !== ext) throw new Error(`Generated file is not a ${ext} image`)
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const name = `${randomBytes(16).toString('hex')}.${ext}`
  const dir = join(uploadsDir(), yyyy, mm)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, name), bytes)
  return `/uploads/${yyyy}/${mm}/${name}`
}

const SEG = /^(\d{4})\/(0[1-9]|1[0-2])\/[A-Za-z0-9_-]{1,64}\.(jpg|png|webp|gif|mp4)$/

/** Maps URL segments under /uploads/ to an absolute file path, or null unless strictly `YYYY/MM/<hex>.<ext>`. */
export function resolveUploadPath(segments: string[]): string | null {
  if (segments.length !== 3) return null
  const rel = segments.join('/')
  if (!SEG.test(rel)) return null
  const base = resolve(uploadsDir())
  const full = resolve(base, ...segments)
  return full.startsWith(base + sep) ? full : null
}

// ---------- message media (admin -> customer messages: photo, GIF or MP4 video) ----------

/** Telegram's limits for files a bot uploads: photos 10 MB, other files 50 MB. */
export const MAX_MESSAGE_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_MESSAGE_VIDEO_BYTES = 50 * 1024 * 1024

export type MediaKind = 'photo' | 'animation' | 'video'

/** Stored shape of a message attachment (saveMessageMedia). */
export const MESSAGE_MEDIA_RE = /^\/uploads\/\d{4}\/(0[1-9]|1[0-2])\/[0-9a-f]{32}\.(jpg|png|webp|gif|mp4)$/

export function mediaKindOf(url: string): MediaKind | null {
  const m = MESSAGE_MEDIA_RE.exec(url)
  if (!m) return null
  return m[2] === 'mp4' ? 'video' : m[2] === 'gif' ? 'animation' : 'photo'
}

/** Absolute file of a stored attachment URL, or null when the URL is not one. */
export function mediaFile(url: string): string | null {
  return MESSAGE_MEDIA_RE.test(url) ? resolveUploadPath(url.slice('/uploads/'.length).split('/')) : null
}

export async function saveMessageMedia(
  file: File,
  now: Date = new Date(),
): Promise<{ ok: true; url: string; kind: MediaKind } | { ok: false; error: string; tooBig?: boolean }> {
  if (file.size > MAX_MESSAGE_VIDEO_BYTES) return { ok: false, error: 'File is larger than 50 MB', tooBig: true }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const img = sniffImage(bytes)
  const ext: MediaExt | null = img ?? (sniffMp4(bytes) ? 'mp4' : null)
  if (!ext) return { ok: false, error: 'Only JPG, PNG, WEBP, GIF images and MP4 videos are allowed' }
  if (ext === 'mp4' ? bytes.length > MAX_MESSAGE_VIDEO_BYTES : bytes.length > MAX_MESSAGE_IMAGE_BYTES) {
    return { ok: false, error: ext === 'mp4' ? 'Video is larger than 50 MB' : 'Image is larger than 10 MB', tooBig: true }
  }
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const name = `${randomBytes(16).toString('hex')}.${ext}`
  const dir = join(uploadsDir(), yyyy, mm)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, name), bytes)
  const url = `/uploads/${yyyy}/${mm}/${name}`
  return { ok: true, url, kind: mediaKindOf(url)! }
}
