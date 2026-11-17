import { describe, it, expect, afterAll } from 'vitest'
import { existsSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { sniffImage, saveUpload, resolveUploadPath, UPLOADS_DIR } from '@/lib/uploads'

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
const ascii = (s: string) => new TextEncoder().encode(s)

describe('sniffImage', () => {
  it('detects png', () => expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png'))
  it('detects jpeg', () => expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpg'))
  it('detects gif', () => expect(sniffImage(ascii('GIF89a......'))).toBe('gif'))
  it('detects webp', () => {
    const b = new Uint8Array(16)
    b.set(ascii('RIFF'), 0)
    b.set(ascii('WEBP'), 8)
    expect(sniffImage(b)).toBe('webp')
  })
  it('rejects svg, html, wav (RIFF without WEBP) and tiny input', () => {
    expect(sniffImage(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(sniffImage(ascii('<html><script>alert(1)</script></html>'))).toBeNull()
    const wav = new Uint8Array(16)
    wav.set(ascii('RIFF'), 0)
    wav.set(ascii('WAVE'), 8)
    expect(sniffImage(wav)).toBeNull()
    expect(sniffImage(new Uint8Array(2))).toBeNull()
  })
})

describe('saveUpload', () => {
  const made: string[] = []
  afterAll(() => {
    for (const p of made) rmSync(p, { force: true })
  })

  it('rejects files over 5 MB', async () => {
    const big = new Uint8Array(6 * 1024 * 1024)
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const r = await saveUpload(new File([big], 'a.png'))
    expect(r.ok).toBe(false)
  })
  it('rejects non-images regardless of name/type', async () => {
    const r = await saveUpload(new File([ascii('<svg onload=alert(1)>')], 'a.png', { type: 'image/png' }))
    expect(r.ok).toBe(false)
  })
  it('stores a png under uploads/YYYY/MM with a random name and sniffed extension', async () => {
    const png = new Uint8Array(32)
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const r = await saveUpload(new File([png], 'evil.svg'), new Date(Date.UTC(2026, 10, 17)))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.url).toMatch(/^\/uploads\/2026\/11\/[0-9a-f]{32}\.png$/)
    const p = resolveUploadPath(r.url.replace('/uploads/', '').split('/'))!
    made.push(p)
    expect(existsSync(p)).toBe(true)
  })
})

describe('resolveUploadPath', () => {
  it('rejects traversal, absolute and malformed segments', () => {
    expect(resolveUploadPath(['..', 'x'])).toBeNull()
    expect(resolveUploadPath(['2026', '11', '..', 'x.png'])).toBeNull()
    expect(resolveUploadPath(['2026', '11', '../../package.json'])).toBeNull()
    expect(resolveUploadPath(['/etc', 'passwd'])).toBeNull()
    expect(resolveUploadPath(['C:', 'x', 'y.png'])).toBeNull()
    expect(resolveUploadPath(['2026', '11', 'abc.svg'])).toBeNull()
    expect(resolveUploadPath(['2026', '11'])).toBeNull()
    expect(resolveUploadPath(['2026', '11', 'a%2e%2e.png'])).toBeNull()
  })
  it('maps a valid path inside uploads/', () => {
    const p = resolveUploadPath(['2026', '11', 'abc.png'])!
    expect(p).toBe(join(resolve(UPLOADS_DIR), '2026', '11', 'abc.png'))
    expect(p.startsWith(resolve(UPLOADS_DIR) + sep)).toBe(true)
  })
})
