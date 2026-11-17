'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateVariantInlineAction } from '@/app/admin/actions/products'

/**
 * One editable number (price or stock) of a variant in the product list. Saves on Enter or blur when the
 * value changed; Escape restores the saved value. Errors are shown under the field.
 */
export default function InlineVariantCell({
  variantId,
  field,
  value,
  label,
  low = false,
}: {
  variantId: number
  field: 'priceUzs' | 'stock'
  value: number
  /** Accessible name, e.g. "Price of A2633-BLK". */
  label: string
  /** Highlights a low stock value. */
  low?: boolean
}) {
  const [saved, setSaved] = useState(value)
  const [draft, setDraft] = useState(String(value))
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pending, start] = useTransition()
  const errId = useId()
  const router = useRouter()
  const inFlight = useRef(false) // Enter followed by blur must not save twice

  function commit() {
    const text = draft.trim()
    if (text === String(saved)) return setError(null)
    const n = Number(text)
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(n)) return setError('Whole number >= 0')
    if (inFlight.current) return
    inFlight.current = true
    start(async () => {
      const r = await updateVariantInlineAction(variantId, { [field]: n }).finally(() => {
        inFlight.current = false
      })
      if (!r.ok) return setError(r.error)
      const next = field === 'priceUzs' ? r.variant.priceUzs : r.variant.stock
      setSaved(next)
      setDraft(String(next))
      setError(null)
      setOk(true)
      setTimeout(() => setOk(false), 1500)
      router.refresh() // badges, totals and completeness on the row
    })
  }

  return (
    <div className="min-w-0">
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errId : undefined}
        disabled={pending}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            setDraft(String(saved))
            setError(null)
          }
        }}
        className={`w-full rounded-md border px-2 py-1 text-right font-mono text-xs tabular-nums focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 disabled:opacity-60 ${
          error ? 'border-red-400 bg-red-50' : ok ? 'border-green-400 bg-green-50' : low ? 'border-amber-300 bg-amber-50' : 'border-neutral-200 bg-white'
        } ${field === 'priceUzs' ? 'min-w-[7rem]' : 'min-w-[4rem]'}`}
      />
      {error ? (
        <p id={errId} role="alert" className="mt-0.5 text-[11px] leading-tight text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}
