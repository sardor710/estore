import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import { flattenMessages, applyUiOverrides } from '@/i18n/merge'
import { loadMessages } from '@/i18n/request'

describe('flattenMessages', () => {
  it('flattens to dot paths', () => {
    expect(flattenMessages({ a: { b: 'x', c: { d: 'y' } }, e: 'z' })).toEqual({ 'a.b': 'x', 'a.c.d': 'y', e: 'z' })
  })
})

describe('applyUiOverrides', () => {
  const base = { nav: { cart: 'Savat', search: 'Qidiruv' }, store: { name: 'Dokon' } }
  it('deep-merges non-empty values for that locale only', () => {
    const out = applyUiOverrides(base, 'uz', [
      { key: 'nav.cart', value: { uz: 'Korzina', ru: 'X' } },
      { key: 'nav.search', value: { uz: '   ' } },
      { key: 'store.name', value: { ru: 'only ru' } },
    ])
    expect(out).toEqual({ nav: { cart: 'Korzina', search: 'Qidiruv' }, store: { name: 'Dokon' } })
    expect(base.nav.cart).toBe('Savat')
  })
  it('can add a key missing from the file and ignores junk values', () => {
    const out = applyUiOverrides(base, 'ru', [
      { key: 'new.deep.key', value: { ru: 'Privet' } },
      { key: 'nav.cart', value: 'oops' },
      { key: 'nav.search', value: null },
    ])
    expect(out).toMatchObject({ new: { deep: { key: 'Privet' } }, nav: { cart: 'Savat' } })
  })
  it('does not let a key traverse through a string leaf or proto', () => {
    const out = applyUiOverrides(base, 'uz', [
      { key: 'nav.cart.sub', value: { uz: 'x' } },
      { key: '__proto__.polluted', value: { uz: 'x' } },
    ])
    expect(out.nav.cart).toBe('Savat')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('loadMessages with DB overrides', () => {
  it('overrides the file value for the matching locale', async () => {
    const file = await loadMessages('uz')
    expect(file.nav.cart).toBeTruthy()
    await prisma.uiString.create({ data: { key: 'nav.cart', value: { uz: 'OVERRIDDEN', ru: 'RU' } } })
    expect((await loadMessages('uz')).nav.cart).toBe('OVERRIDDEN')
    expect((await loadMessages('ru')).nav.cart).toBe('RU')
    expect((await loadMessages('en')).nav.cart).not.toBe('OVERRIDDEN')
  })
})
