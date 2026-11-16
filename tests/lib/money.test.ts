import { describe, it, expect } from 'vitest'
import { formatUzs } from '@/lib/money'

describe('formatUzs', () => {
  it('formats uz with NBSP grouping and soʻm', () => {
    expect(formatUzs(1290000, 'uz')).toBe('1\u00a0290\u00a0000 so\u02bbm')
  })
  it('formats ru', () => {
    expect(formatUzs(1290000, 'ru')).toBe('1\u00a0290\u00a0000 сум')
    expect(formatUzs(0, 'ru')).toBe('0 сум')
  })
  it('formats en', () => {
    expect(formatUzs(1290000, 'en')).toBe('1,290,000 UZS')
  })
})
