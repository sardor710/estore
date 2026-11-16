import { describe, it, expect } from 'vitest'
import { stepIndex, visibleIndex } from '@/lib/gallery'

describe('gallery broken-image fallback', () => {
  it('shows the wanted image, or the next one that loads', () => {
    expect(visibleIndex(3, new Set(), 1)).toBe(1)
    expect(visibleIndex(3, new Set([1]), 1)).toBe(2)
    expect(visibleIndex(3, new Set([1, 2]), 1)).toBe(0)
    expect(visibleIndex(3, new Set([0, 1, 2]), 0)).toBeNull()
    expect(visibleIndex(0, new Set(), 0)).toBeNull()
  })
  it('arrows skip broken images', () => {
    expect(stepIndex(4, new Set([1]), 0, 1)).toBe(2)
    expect(stepIndex(4, new Set([3]), 0, -1)).toBe(2)
    expect(stepIndex(2, new Set([1]), 0, 1)).toBe(0)
  })
})
