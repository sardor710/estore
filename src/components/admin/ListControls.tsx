'use client'

import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'

export function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

const b = 'rounded-lg p-1.5 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'

/** Up / down / remove for one row of an editable list. */
export default function ListControls({
  index,
  length,
  onMove,
  onRemove,
  what,
  removeLabel,
}: {
  index: number
  length: number
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  what: string
  /** Accessible name of the remove button; defaults to "Remove <what>". */
  removeLabel?: string
}) {
  return (
    <div className="flex shrink-0 items-center">
      <button type="button" className={b} disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${what} up`}>
        <ArrowUp size={16} />
      </button>
      <button type="button" className={b} disabled={index === length - 1} onClick={() => onMove(1)} aria-label={`Move ${what} down`}>
        <ArrowDown size={16} />
      </button>
      <button type="button" className={`${b} hover:!bg-red-50 hover:text-red-700`} onClick={onRemove} aria-label={removeLabel ?? `Remove ${what}`} title={removeLabel}>
        <Trash2 size={16} />
      </button>
    </div>
  )
}
