'use client'

import { useSyncExternalStore } from 'react'

/** The short "Added · View cart" confirmation shown after adding (the cart drawer stays closed). */
export type CartToastKind = { kind: 'added' } | { kind: 'addedMany'; count: number } | { kind: 'max' }
export type CartToastState = CartToastKind & { id: number }

let current: CartToastState | null = null
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function showCartToast(t: CartToastKind): void {
  current = { ...t, id: ++seq }
  emit()
}

export function dismissCartToast(id?: number): void {
  if (!current || (id !== undefined && current.id !== id)) return
  current = null
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useCartToast(): { toast: CartToastState | null; dismiss(): void } {
  const toast = useSyncExternalStore(subscribe, () => current, () => null)
  return { toast, dismiss: () => dismissCartToast(toast?.id) }
}
