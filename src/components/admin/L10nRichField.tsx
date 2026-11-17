'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { locales, type Locale } from '@/i18n/routing'
import type { L10n } from '@/lib/localized'

// CKEditor touches the DOM and is large: client-only, fetched when the field first renders.
const RichTextEditor = dynamic(() => import('./RichTextEditor'), {
  ssr: false,
  loading: () => <div className="h-60 animate-pulse rounded-lg border border-neutral-200 bg-neutral-50" aria-busy="true" />,
})

/** One translatable rich-text value, edited through uz / ru / en tabs (mirrors L10nField). */
export default function L10nRichField({ label, value, onChange }: { label: string; value: L10n; onChange: (next: L10n) => void }) {
  const [active, setActive] = useState<Locale>('en')
  return (
    <div>
      <div className="mb-1 flex justify-end">
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
      {/* key remounts the editor with the other language's content; the editor shows its own label. */}
      <RichTextEditor key={active} value={value[active] ?? ''} onChange={(html) => onChange({ ...value, [active]: html })} label={`${label} (${active})`} />
    </div>
  )
}
