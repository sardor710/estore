import { describe, it, expect } from 'vitest'
import { t } from '@/lib/localized'

describe('t', () => {
  it('falls back to any available locale', () => {
    expect(t({ en: 'A' }, 'uz')).toBe('A')
  })
  it('skips empty strings', () => {
    expect(t({ uz: '', ru: 'R' }, 'uz')).toBe('R')
  })
  it('prefers requested locale', () => {
    expect(t({ uz: 'U', ru: 'R', en: 'E' }, 'ru')).toBe('R')
  })
  it('returns empty for null/undefined/all empty', () => {
    expect(t(null, 'ru')).toBe('')
    expect(t(undefined, 'en')).toBe('')
    expect(t({ uz: '', ru: '  ' }, 'en')).toBe('')
  })
})
