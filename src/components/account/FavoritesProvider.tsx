'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { toggleFavoriteAction } from '@/app/[locale]/account/actions'

type FavoritesContext = {
  signedIn: boolean
  isFavorite(productId: number): boolean
  /** Optimistic toggle; resolves to false when the server refused/failed (state reverted). */
  toggle(productId: number): Promise<boolean>
}

const Ctx = createContext<FavoritesContext | null>(null)

/** Null outside the storefront shell (e.g. the admin product preview): hearts are not rendered there. */
export function useFavorites(): FavoritesContext | null {
  return useContext(Ctx)
}

/**
 * Favorite product ids of the signed-in shopper, seeded by StoreShell (server) so no client fetch is needed.
 * When the server sends a different list (e.g. after a revalidating server action) and nothing is in flight,
 * the client state follows it.
 */
export default function FavoritesProvider({ ids, signedIn, children }: { ids: number[]; signedIn: boolean; children: ReactNode }) {
  const serverKey = ids.join(',')
  const [state, setState] = useState(() => ({ key: serverKey, set: new Set(ids) as ReadonlySet<number> }))
  const inFlight = useRef(new Set<number>())
  if (state.key !== serverKey && inFlight.current.size === 0) {
    setState({ key: serverKey, set: new Set(ids) })
  }

  const setOne = (productId: number, on: boolean) =>
    setState((s) => {
      if (s.set.has(productId) === on) return s
      const next = new Set(s.set)
      if (on) next.add(productId)
      else next.delete(productId)
      return { key: s.key, set: next }
    })

  const current = useRef(state.set)
  current.current = state.set

  const toggle = useCallback(async (productId: number): Promise<boolean> => {
    if (inFlight.current.has(productId)) return true
    const was = current.current.has(productId)
    inFlight.current.add(productId)
    setOne(productId, !was)
    try {
      const r = await toggleFavoriteAction(productId)
      if (!r.ok) {
        setOne(productId, was)
        return false
      }
      setOne(productId, r.favorite) // a refused add (product no longer on sale) comes back as false
      return r.favorite === !was
    } catch {
      setOne(productId, was)
      return false
    } finally {
      inFlight.current.delete(productId)
    }
  }, [])

  const value = useMemo<FavoritesContext>(
    () => ({ signedIn, isFavorite: (id) => state.set.has(id), toggle }),
    [signedIn, state.set, toggle],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
