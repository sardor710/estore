'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Quote } from '@/lib/orders'
import type { Locale } from '@/i18n/routing'
import type { CartLine } from './cart'

export type QuoteState = { quote: Quote | null; loading: boolean; error: boolean; reload(): void }

/** Fetches current DB prices for the cart from POST /api/cart/quote. Prices are never taken from localStorage. */
export function useQuote(lines: CartLine[], locale: Locale, enabled = true): QuoteState {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [nonce, setNonce] = useState(0)
  const seq = useRef(0)
  const key = JSON.stringify(lines)

  useEffect(() => {
    if (!enabled) return
    if (lines.length === 0) {
      setQuote(null)
      setError(false)
      setLoading(false)
      return
    }
    const id = ++seq.current
    setLoading(true)
    setError(false)
    fetch('/api/cart/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines, locale }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<Quote>) : Promise.reject(new Error('quote'))))
      .then((q) => {
        if (id === seq.current) setQuote(q)
      })
      .catch(() => {
        if (id === seq.current) setError(true)
      })
      .finally(() => {
        if (id === seq.current) setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, locale, enabled, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { quote, loading, error, reload }
}
