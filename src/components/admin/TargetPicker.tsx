'use client'

import { useId, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { input } from './ui'

export type PickerOption = { id: number; label: string }

const MAX_SHOWN = 50

/** Searchable multi-select over a flat list of options (products, categories or brands). */
export default function TargetPicker({
  options,
  value,
  onChange,
  noun,
}: {
  options: PickerOption[]
  value: number[]
  onChange: (ids: number[]) => void
  /** Plural noun for labels, e.g. "products". */
  noun: string
}) {
  const [q, setQ] = useState('')
  const searchId = useId()
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options])
  const selected = new Set(value)
  const needle = q.trim().toLowerCase()
  const matches = options.filter((o) => !needle || o.label.toLowerCase().includes(needle) || String(o.id) === needle)
  const shown = matches.slice(0, MAX_SHOWN)

  const toggle = (id: number) => onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id])

  return (
    <div className="space-y-2">
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={`Selected ${noun}`}>
          {value.map((id) => (
            <li key={id} className="inline-flex items-center gap-1 rounded-full bg-neutral-900 py-0.5 pl-2.5 pr-1 text-xs font-semibold text-white">
              {byId.get(id)?.label ?? `#${id} (deleted)`}
              <button type="button" onClick={() => toggle(id)} className="rounded-full p-0.5 hover:bg-neutral-700" aria-label={`Remove ${byId.get(id)?.label ?? id}`}>
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500">Nothing picked yet.</p>
      )}
      <label htmlFor={searchId} className="sr-only">
        Search {noun}
      </label>
      <input id={searchId} className={input} type="search" placeholder={`Search ${noun}...`} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="max-h-64 overflow-y-auto rounded-lg border border-neutral-200 bg-white" role="group" aria-label={`Available ${noun}`}>
        {shown.map((o) => (
          <li key={o.id}>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-neutral-50">
              <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              <span className="text-xs text-neutral-400">#{o.id}</span>
            </label>
          </li>
        ))}
        {shown.length === 0 ? <li className="px-3 py-2 text-sm text-neutral-500">No {noun} match.</li> : null}
      </ul>
      {matches.length > shown.length ? (
        <p className="text-xs text-neutral-500">
          Showing {shown.length} of {matches.length}. Type to narrow down.
        </p>
      ) : null}
    </div>
  )
}
