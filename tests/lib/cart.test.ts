import { describe, it, expect, beforeEach } from 'vitest'
import { addItem, setQty, removeItem, countLines, type CartLine } from '@/lib/cart/cart'
import { addToCart, clearCart, getCartLines, isCartDrawerOpen } from '@/lib/cart/useCart'

describe('cart ops', () => {
  it('adds new line and merges existing', () => {
    let l: CartLine[] = []
    l = addItem(l, 5, 1)
    l = addItem(l, 6, 2)
    l = addItem(l, 5, 3)
    expect(l).toEqual([{ variantId: 5, qty: 4 }, { variantId: 6, qty: 2 }])
  })
  it('does not mutate input', () => {
    const l: CartLine[] = [{ variantId: 1, qty: 1 }]
    addItem(l, 1, 1)
    expect(l).toEqual([{ variantId: 1, qty: 1 }])
  })
  it('ignores non-positive or non-integer add', () => {
    expect(addItem([], 1, 0)).toEqual([])
    expect(addItem([], 1, -2)).toEqual([])
    expect(addItem([], 1, 1.5)).toEqual([])
  })
  it('caps add at max when given', () => {
    expect(addItem([{ variantId: 1, qty: 3 }], 1, 5, 4)).toEqual([{ variantId: 1, qty: 4 }])
  })
  it('setQty replaces; qty<=0 removes', () => {
    const l: CartLine[] = [{ variantId: 1, qty: 2 }, { variantId: 2, qty: 1 }]
    expect(setQty(l, 1, 7)).toEqual([{ variantId: 1, qty: 7 }, { variantId: 2, qty: 1 }])
    expect(setQty(l, 1, 0)).toEqual([{ variantId: 2, qty: 1 }])
    expect(setQty(l, 2, -1)).toEqual([{ variantId: 1, qty: 2 }])
  })
  it('removeItem and countLines', () => {
    const l: CartLine[] = [{ variantId: 1, qty: 2 }, { variantId: 2, qty: 3 }]
    expect(removeItem(l, 1)).toEqual([{ variantId: 2, qty: 3 }])
    expect(countLines(l)).toBe(5)
  })
})

describe('cart store', () => {
  beforeEach(() => clearCart())
  it('adding reports a change and never opens the drawer', () => {
    expect(addToCart(7, 1, 5)).toBe(true)
    expect(isCartDrawerOpen()).toBe(false)
    expect(getCartLines()).toEqual([{ variantId: 7, qty: 1 }])
  })
  it('reports no change when the stock cap is already reached', () => {
    expect(addToCart(7, 5, 5)).toBe(true)
    expect(addToCart(7, 1, 5)).toBe(false)
    expect(getCartLines()).toEqual([{ variantId: 7, qty: 5 }])
  })
  it('reports no change for a non-positive qty', () => {
    expect(addToCart(7, 0)).toBe(false)
    expect(getCartLines()).toEqual([])
  })
})
