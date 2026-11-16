'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

/**
 * STUB (Task 2). In-memory only, not persisted. Task 4 replaces the body
 * (localStorage + server price lookup) and keeps this exact signature.
 */
export type CartLine = { variantId: string; qty: number }

let lines: CartLine[] = []
const listeners = new Set<() => void>()

function emit(next: CartLine[]) {
  lines = next
  listeners.forEach((l) => l())
}
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
const getSnapshot = () => lines
const EMPTY: CartLine[] = []
const getServerSnapshot = (): CartLine[] => EMPTY

export function useCart(): {
  lines: CartLine[]
  add(variantId: string, qty: number): void
  setQty(variantId: string, qty: number): void
  remove(variantId: string): void
  clear(): void
  count: number
} {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const add = useCallback((variantId: string, qty: number) => {
    if (qty <= 0) return
    const found = lines.find((l) => l.variantId === variantId)
    emit(
      found
        ? lines.map((l) => (l.variantId === variantId ? { ...l, qty: l.qty + qty } : l))
        : [...lines, { variantId, qty }],
    )
  }, [])
  const setQty = useCallback((variantId: string, qty: number) => {
    emit(qty <= 0 ? lines.filter((l) => l.variantId !== variantId) : lines.map((l) => (l.variantId === variantId ? { ...l, qty } : l)))
  }, [])
  const remove = useCallback((variantId: string) => emit(lines.filter((l) => l.variantId !== variantId)), [])
  const clear = useCallback(() => emit([]), [])
  const count = useMemo(() => current.reduce((n, l) => n + l.qty, 0), [current])
  return { lines: current, add, setQty, remove, clear, count }
}
