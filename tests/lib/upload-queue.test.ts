import { describe, it, expect } from 'vitest'
import { checkImageFile, uploadAll } from '@/lib/admin/upload-queue'

const MB = 1024 * 1024
const f = (name: string, type = 'image/jpeg', size = 1000) => ({ name, type, size })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('checkImageFile', () => {
  it('accepts the four image types up to exactly 5 MB', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) expect(checkImageFile(f('a', type))).toBeNull()
    expect(checkImageFile(f('a', 'image/png', 5 * MB))).toBeNull()
  })
  it('rejects other types and larger files', () => {
    expect(checkImageFile(f('a.pdf', 'application/pdf'))).toBe('Not a JPG, PNG, WEBP or GIF')
    expect(checkImageFile(f('a.svg', 'image/svg+xml'))).toBe('Not a JPG, PNG, WEBP or GIF')
    expect(checkImageFile(f('a', 'image/png', 5 * MB + 1))).toBe('Larger than 5 MB')
  })
})

describe('uploadAll', () => {
  it('keeps selection order even when later files finish first', async () => {
    const files = [f('a'), f('b'), f('c')]
    const delay: Record<string, number> = { a: 30, b: 10, c: 1 }
    const r = await uploadAll(files, async (x) => {
      await sleep(delay[x.name])
      return `/u/${x.name}`
    })
    expect(r).toEqual({ urls: ['/u/a', '/u/b', '/u/c'], errors: [] })
  })
  it('never runs more than 3 uploads at once by default, and honours a custom limit', async () => {
    for (const [limit, expected] of [[undefined, 3], [2, 2]] as const) {
      let inFlight = 0
      let peak = 0
      await uploadAll(
        Array.from({ length: 8 }, (_, i) => f(`f${i}`)),
        async (x) => {
          inFlight++
          peak = Math.max(peak, inFlight)
          await sleep(5)
          inFlight--
          return x.name
        },
        limit === undefined ? undefined : { concurrency: limit },
      )
      expect(peak).toBe(expected)
    }
  })
  it('a failing upload does not stop the others; the error names the file', async () => {
    const r = await uploadAll([f('a'), f('bad'), f('c')], async (x) => {
      if (x.name === 'bad') throw new Error('Server said no')
      return `/u/${x.name}`
    })
    expect(r.urls).toEqual(['/u/a', '/u/c'])
    expect(r.errors).toEqual([{ name: 'bad', message: 'Server said no' }])
  })
  it('mixed batch: rejected files never reach upload, valid ones keep their order, statuses reported', async () => {
    const called: string[] = []
    const statuses: string[] = []
    const files = [f('big.jpg', 'image/jpeg', 8 * MB), f('one.jpg'), f('doc.pdf', 'application/pdf'), f('two.png', 'image/png'), f('three.webp', 'image/webp'), f('four.gif', 'image/gif')]
    const r = await uploadAll(
      files,
      async (x) => {
        called.push(x.name)
        return `/u/${x.name}`
      },
      { onStatus: (i, s) => statuses.push(`${i}:${s}`) },
    )
    expect(called.sort()).toEqual(['four.gif', 'one.jpg', 'three.webp', 'two.png'])
    expect(r.urls).toEqual(['/u/one.jpg', '/u/two.png', '/u/three.webp', '/u/four.gif'])
    expect(r.errors).toEqual([
      { name: 'big.jpg', message: 'Larger than 5 MB' },
      { name: 'doc.pdf', message: 'Not a JPG, PNG, WEBP or GIF' },
    ])
    expect(statuses).toContain('0:error')
    expect(statuses).toContain('1:uploading')
    expect(statuses).toContain('1:done')
  })
  it('empty list resolves immediately', async () => {
    expect(await uploadAll([], async () => 'x')).toEqual({ urls: [], errors: [] })
  })
})
