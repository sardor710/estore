import { describe, it, expect } from 'vitest'
import { remapImageIndex, variantThumb } from '@/lib/admin/variant-display'

const imgs = ['a.jpg', 'b.jpg', 'c.jpg']

describe('variantThumb', () => {
  it('uses the variant image, falls back to the cover, then null', () => {
    expect(variantThumb(imgs, 2)).toBe('c.jpg')
    expect(variantThumb(imgs, 7)).toBe('a.jpg')
    expect(variantThumb(imgs, -1)).toBe('a.jpg')
    expect(variantThumb(imgs, null)).toBe('a.jpg')
    expect(variantThumb([], 0)).toBeNull()
  })
})

describe('remapImageIndex', () => {
  it('follows the picture when it moves', () => {
    expect(remapImageIndex(imgs, ['c.jpg', 'a.jpg', 'b.jpg'], 2)).toBe(0)
    expect(remapImageIndex(imgs, ['b.jpg', 'a.jpg', 'c.jpg'], 0)).toBe(1)
  })
  it('becomes null when the picture is removed', () => {
    expect(remapImageIndex(imgs, ['a.jpg', 'c.jpg'], 1)).toBeNull()
  })
  it('shifts when an earlier picture is removed', () => {
    expect(remapImageIndex(imgs, ['b.jpg', 'c.jpg'], 2)).toBe(1)
  })
  it('keeps index when pictures are appended', () => {
    expect(remapImageIndex(imgs, [...imgs, 'd.jpg', 'e.jpg'], 1)).toBe(1)
  })
  it('null and out-of-range stay null', () => {
    expect(remapImageIndex(imgs, imgs, null)).toBeNull()
    expect(remapImageIndex(imgs, imgs, 9)).toBeNull()
  })
  it('editing one URL in place keeps every index (same length, one slot changed)', () => {
    expect(remapImageIndex(imgs, ['a.jpg', 'b2.jpg', 'c.jpg'], 1)).toBe(1)
    expect(remapImageIndex(imgs, ['a.jpg', 'b2.jpg', 'c.jpg'], 2)).toBe(2)
    expect(remapImageIndex(imgs, ['a.jpg', '', 'c.jpg'], 1)).toBe(1)
  })
  it('a swap (two slots changed) still follows the pictures', () => {
    expect(remapImageIndex(imgs, ['b.jpg', 'a.jpg', 'c.jpg'], 0)).toBe(1)
  })
  it('duplicate URLs map to the first match', () => {
    expect(remapImageIndex(['x', 'y', 'x'], ['y', 'x', 'x'], 2)).toBe(1)
  })
})
