'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { addItem, countLines, removeItem, sanitizeLines, setQty as setLineQty, type CartLine } from './cart'

export type { CartLine }

export const CART_STORAGE_KEY = 'estore.cart.v1'

const EMPTY: CartLine[] = []
let lines: CartLine[] = EMPTY
let loaded = false
let drawerOpen = false
const cartListeners = new Set<() => void>()
const drawerListeners = new Set<() => void>()

function readStorage(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY)
    return raw ? sanitizeLines(JSON.parse(raw)) : EMPTY
  } catch {
    return EMPTY
  }
}

function writeStorage(next: CartLine[]) {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // storage unavailable (private mode / quota): cart still works in memory
  }
}

function ensureLoaded() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  lines = readStorage()
  window.addEventListener('storage', (e) => {
    if (e.key !== CART_STORAGE_KEY) return
    lines = readStorage()
    cartListeners.forEach((l) => l())
  })
}

function emit(next: CartLine[]) {
  ensureLoaded()
  lines = next
  writeStorage(next)
  cartListeners.forEach((l) => l())
}

function subscribeCart(cb: () => void) {
  ensureLoaded()
  cartListeners.add(cb)
  return () => {
    cartListeners.delete(cb)
  }
}
const getCartSnapshot = () => {
  ensureLoaded()
  return lines
}
const getServerCart = (): CartLine[] => EMPTY

function setDrawer(open: boolean) {
  if (drawerOpen === open) return
  drawerOpen = open
  drawerListeners.forEach((l) => l())
}
function subscribeDrawer(cb: () => void) {
  drawerListeners.add(cb)
  return () => {
    drawerListeners.delete(cb)
  }
}

export const isCartDrawerOpen = () => drawerOpen
export const getCartLines = (): CartLine[] => getCartSnapshot()

/**
 * Adds to the cart without opening the drawer (the shopper opens it from the cart icon or the toast).
 * Returns whether the variant's quantity actually changed (false when `max` stock is already in the cart).
 */
export function addToCart(variantId: number, qty: number, max?: number): boolean {
  ensureLoaded()
  const before = lines.find((l) => l.variantId === variantId)?.qty ?? 0
  const next = addItem(lines, variantId, qty, max)
  const after = next.find((l) => l.variantId === variantId)?.qty ?? 0
  if (after === before) return false
  emit(next)
  return true
}

export const clearCart = () => emit(EMPTY)

/** Shared open/close state of the cart drawer. */
export function useCartDrawer(): { open: boolean; setOpen(open: boolean): void } {
  const open = useSyncExternalStore(subscribeDrawer, () => drawerOpen, () => false)
  return { open, setOpen: setDrawer }
}

export function useCart(): {
  lines: CartLine[]
  /** True when the cart changed; never opens the drawer. */
  add(variantId: number, qty: number, max?: number): boolean
  setQty(variantId: number, qty: number): void
  remove(variantId: number): void
  clear(): void
  count: number
} {
  const current = useSyncExternalStore(subscribeCart, getCartSnapshot, getServerCart)
  const add = useCallback((variantId: number, qty: number, max?: number) => addToCart(variantId, qty, max), [])
  const setQty = useCallback((variantId: number, qty: number) => emit(setLineQty(getCartSnapshot(), variantId, qty)), [])
  const remove = useCallback((variantId: number) => emit(removeItem(getCartSnapshot(), variantId)), [])
  const clear = useCallback(() => clearCart(), [])
  const count = useMemo(() => countLines(current), [current])
  return { lines: current, add, setQty, remove, clear, count }
}
