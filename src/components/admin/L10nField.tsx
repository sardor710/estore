'use client'

import { useId, useState } from 'react'
import { locales, type Locale } from '@/i18n/routing'
import type { L10n } from '@/lib/localized'
import { input, Label } from './ui'

/** One translatable value, edited through uz / ru / en tabs. */
export default function L10nField({
  label,
  value,
  onChange,
  multiline = false,
  rows = 4,
  mono = false,
  hint,
}: {
  label: string
  value: L10n
  onChange: (next: L10n) => void
  multiline?: boolean
  rows?: number
  mono?: boolean
  hint?: string
}) {
  const [active, setActive] = useState<Locale>('en')
  const id = useId()
  const set = (l: Locale, v: string) => onChange({ ...value, [l]: v })
  const common = {
    id: `${id}-${active}`,
    value: value[active] ?? '',
    onChange: (e: { target: { value: string } }) => set(active, e.target.value),
    className: `${input} ${mono ? 'font-mono text-xs' : ''}`,
    'aria-labelledby': `${id}-label`,
  }
  return (
    <div>
      <div className="mb-1 flex items-end justify-between gap-2">
        <span id={`${id}-label`}>
          <Label hint={hint}>{label}</Label>
        </span>
        <div role="tablist" aria-label={`${label} language`} className="flex shrink-0 gap-1">
          {locales.map((l) => {
            const filled = Boolean(value[l]?.trim())
            return (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={active === l}
                onClick={() => setActive(l)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase transition ${
                  active === l ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {l}
                <span className={`ml-1 inline-block h-1.5 w-1.5 rounded-full ${filled ? 'bg-green-500' : 'bg-neutral-300'}`} aria-hidden />
                <span className="sr-only">{filled ? ' (filled)' : ' (empty)'}</span>
              </button>
            )
          })}
        </div>
      </div>
      {multiline ? <textarea rows={rows} {...common} /> : <input type="text" {...common} />}
    </div>
  )
}
