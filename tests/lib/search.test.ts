import { describe, it, expect } from 'vitest'
import { tokenize } from '@/lib/search/text'
import { editDistance, tokenMatch, rank, type SearchDoc } from '@/lib/search/rank'

function doc(id: number, title: string, extra: Partial<Record<keyof SearchDoc['tokens'], string>> = {}, skus: string[] = []): SearchDoc {
  return {
    id,
    tokens: {
      titleLocal: tokenize(title),
      title: [],
      brand: tokenize(extra.brand ?? ''),
      category: tokenize(extra.category ?? ''),
      spec: tokenize(extra.spec ?? ''),
      sku: skus.flatMap(tokenize),
    },
    skuCompact: skus.map((s) => tokenize(s).join('')),
  }
}

describe('tokenize', () => {
  it('treats all Uzbek apostrophe forms alike', () => {
    expect(tokenize('Oʻzbek‘ Zaryadlovchi!')).toEqual(tokenize("O'zbek zaryadlovchi"))
    expect(tokenize('oʼzbek')).toEqual(['ozbek'])
  })
  it('transliterates Cyrillic to Latin', () => {
    expect(tokenize('Быстрая зарядка')).toEqual(['bystraya', 'zaryadka'])
    expect(tokenize('Ёмкость')).toEqual(['emkost'])
  })
  it('returns [] for punctuation and emoji only', () => {
    expect(tokenize('!!! 🔥')).toEqual([])
  })
})

describe('matching', () => {
  it('editDistance counts one missing letter', () => {
    expect(editDistance('ankr', 'anker', 1)).toBe(1)
    expect(editDistance('abcdef', 'zzzzzz', 2)).toBe(3)
  })
  it('tokenMatch: prefix, typo, miss', () => {
    expect(tokenMatch('char', 'charger')).toBe(0.9)
    expect(tokenMatch('anker', 'anker')).toBe(1)
    expect(tokenMatch('zaryadlovhci', 'zaryadlovchi')).toBeGreaterThan(0)
    expect(tokenMatch('ab', 'xy')).toBe(0)
    expect(tokenMatch('a', 'anker')).toBe(0)
  })
})

describe('rank', () => {
  const docs = [doc(1, 'Anker 735 charger', { brand: 'Anker' }), doc(2, 'Baseus USB-C cable', { brand: 'Baseus' }, ['BS-C100'])]
  it('tolerates typos and Cyrillic', () => {
    expect(rank('ankr', docs)).toEqual([1])
    expect(rank('анкер', docs)).toEqual([1])
    expect(rank('CHARG', docs)).toEqual([1])
  })
  it('requires every word to match (AND)', () => {
    expect(rank('anker cable', docs)).toEqual([])
    expect(rank('baseus cable', docs)).toEqual([2])
  })
  it('finds by SKU without separators and ignores nonsense', () => {
    expect(rank('bsc100', docs)).toEqual([2])
    expect(rank('xyzzy', docs)).toEqual([])
    expect(rank('🔥', docs)).toEqual([])
  })
  it('ranks title hits above spec hits', () => {
    const d = [doc(1, 'Cable', { spec: 'fast charger cable' }), doc(2, 'Charger')]
    expect(rank('charger', d)).toEqual([2, 1])
  })
})

describe('numbers and query size (review fixes)', () => {
  it('matches tokens with digits exactly, never by typo or into longer numbers', () => {
    expect(tokenMatch('4060', '4070')).toBe(0)
    expect(tokenMatch('2024', '2025')).toBe(0)
    expect(tokenMatch('15', '15w')).toBe(0)
    expect(tokenMatch('140', '1400')).toBe(0)
    expect(tokenMatch('15', '15')).toBe(1)
    expect(tokenMatch('140', '140w')).toBe(0.9)
  })
  it('"iphone 15" does not match an iPhone 13 whose spec says 15W', () => {
    const d = [doc(1, 'iPhone 15 case'), doc(2, 'iPhone 13 case', { spec: '15W MagSafe' })]
    expect(rank('iphone 15', d)).toEqual([1])
  })
  it('uses at most 6 distinct query words', () => {
    const d = [doc(1, 'Anker charger usb cable fast slim')]
    expect(rank('anker anker charger charger anker charger', d)).toEqual([1])
    expect(rank('anker charger usb cable fast slim qqqqzzzz', d)).toEqual([1]) // 7th distinct word ignored
  })
})
