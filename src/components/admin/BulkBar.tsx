'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { bulkProductsAction } from '@/app/admin/actions/products'
import type { BulkActionType, BulkResult } from '@/lib/admin/products-shared'
import { btn, btnDanger, btnGhost, btnSm, input, Notice } from './ui'

export type Option = { id: number; label: string }

const ACTIONS: { type: BulkActionType; label: string }[] = [
  { type: 'publish', label: 'Publish' },
  { type: 'unpublish', label: 'Unpublish' },
  { type: 'setCategory', label: 'Change category' },
  { type: 'setBrand', label: 'Change brand' },
  { type: 'addToPromotion', label: 'Add to promotion' },
  { type: 'delete', label: 'Delete' },
]

/** Actions for the selected products. Shows what was done and why any product was skipped. */
export default function BulkBar({
  selected,
  titles,
  categories,
  brands,
  promotions,
  onDone,
}: {
  selected: number[]
  /** id -> title, to name skipped products. */
  titles: Record<number, string>
  categories: Option[]
  brands: Option[]
  /** Only promotions that target individual products. */
  promotions: Option[]
  onDone: () => void
}) {
  const router = useRouter()
  const [type, setType] = useState<BulkActionType>('publish')
  const [value, setValue] = useState('')
  const [result, setResult] = useState<{ action: string; r: BulkResult } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const options = type === 'setCategory' ? categories : type === 'setBrand' ? brands : type === 'addToPromotion' ? promotions : null
  const needsValue = type === 'setCategory' || type === 'addToPromotion'

  function apply() {
    setError(null)
    if (needsValue && !value) return setError(type === 'setCategory' ? 'Choose a category.' : 'Choose a promotion.')
    const label = ACTIONS.find((a) => a.type === type)!.label
    if (type === 'delete' && !window.confirm(`Delete ${selected.length} product(s)? This cannot be undone.`)) return
    start(async () => {
      const r = await bulkProductsAction(selected, { type, ...(value ? { value: Number(value) } : {}) })
      setResult({ action: label, r })
      if (r.done > 0) {
        onDone()
        router.refresh()
      }
    })
  }

  if (!selected.length && !result) return null

  return (
    <div className="sticky top-16 z-20 mb-3 space-y-2 md:top-3">
      {selected.length > 0 ? (
        <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 shadow-md ring-1 ring-indigo-600/10">
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-sm font-semibold text-indigo-700">{selected.length} selected</span>
          <label className="sr-only" htmlFor="bulk-action">
            Bulk action
          </label>
          <select
            id="bulk-action"
            className={`${input} !w-auto !py-1 !text-sm`}
            value={type}
            onChange={(e) => {
              setType(e.target.value as BulkActionType)
              setValue('')
            }}
          >
            {ACTIONS.map((a) => (
              <option key={a.type} value={a.type}>
                {a.label}
              </option>
            ))}
          </select>
          {options ? (
            <>
              <label className="sr-only" htmlFor="bulk-value">
                {type === 'setCategory' ? 'Category' : type === 'setBrand' ? 'Brand' : 'Promotion'}
              </label>
              <select id="bulk-value" className={`${input} !w-auto !max-w-full !py-1 !text-sm`} value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">{type === 'setBrand' ? 'No brand' : type === 'setCategory' ? 'Choose category...' : 'Choose promotion...'}</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              {type === 'addToPromotion' && promotions.length === 0 ? <span className="text-xs text-neutral-500">No promotions target individual products.</span> : null}
            </>
          ) : null}
          <button type="button" className={`${type === 'delete' ? btnDanger : btn} ${btnSm} !py-1.5`} onClick={apply} disabled={pending}>
            {pending ? 'Working...' : 'Apply'}
          </button>
          <button type="button" className={`${btnGhost} ${btnSm} !py-1.5`} onClick={onDone} disabled={pending}>
            Clear selection
          </button>
          {error ? (
            <p role="alert" className="w-full text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
      {result ? (
        <Notice kind={result.r.skipped.length ? 'warn' : 'ok'}>
          <div className="flex items-start justify-between gap-3">
            <div>
              {result.action}: {result.r.done} done{result.r.skipped.length ? `, ${result.r.skipped.length} skipped` : ''}.
              {result.r.skipped.length ? (
                <ul className="mt-1 list-disc pl-5">
                  {result.r.skipped.map((s) => (
                    <li key={s.id}>
                      {titles[s.id] ?? `#${s.id}`}: {s.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button type="button" className="shrink-0 rounded text-xs font-semibold underline underline-offset-2 hover:no-underline" onClick={() => setResult(null)}>
              Dismiss
            </button>
          </div>
        </Notice>
      ) : null}
    </div>
  )
}
