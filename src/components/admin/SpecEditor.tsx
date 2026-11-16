'use client'

import { Plus } from 'lucide-react'
import type { SpecGroup, SpecItem } from '@/lib/catalog'
import type { L10n } from '@/lib/localized'
import { btnGhost, btnSm, input, Label } from './ui'
import L10nField from './L10nField'
import ListControls, { move } from './ListControls'

/** Dictionary keys are lowercase a-z0-9 with dashes, like the importer produces. */
export function specKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function SpecEditor({
  groups,
  labels,
  onChange,
  onLabels,
}: {
  groups: SpecGroup[]
  labels: Record<string, L10n>
  onChange: (g: SpecGroup[]) => void
  onLabels: (l: Record<string, L10n>) => void
}) {
  const setGroup = (gi: number, patch: Partial<SpecGroup>) => onChange(groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)))
  const setItem = (gi: number, ii: number, patch: Partial<SpecItem>) =>
    setGroup(gi, { items: groups[gi].items.map((it, i) => (i === ii ? { ...it, ...patch } : it)) })
  const setLabel = (key: string, v: L10n) => onLabels({ ...labels, [key]: v })

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">
        Group names and row names are dictionary keys shared by all products (edit their wording once, here or in Translations). Values are per product.
      </p>
      {groups.map((g, gi) => (
        <fieldset key={gi} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <legend className="px-1 text-xs font-bold text-neutral-500">Group {gi + 1}</legend>
          <div className="mb-3 flex items-start gap-2">
            <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[12rem_1fr]">
              <label>
                <Label>Group key</Label>
                <input className={`${input} font-mono text-xs`} value={g.group} onChange={(e) => setGroup(gi, { group: specKey(e.target.value) })} />
              </label>
              {g.group ? <L10nField label="Group title" value={labels[g.group] ?? {}} onChange={(v) => setLabel(g.group, v)} /> : null}
            </div>
            <ListControls
              index={gi}
              length={groups.length}
              what={`group ${gi + 1}`}
              onMove={(d) => onChange(move(groups, gi, d))}
              onRemove={() => {
                if (window.confirm(`Remove group "${g.group || gi + 1}" and its rows?`)) onChange(groups.filter((_, i) => i !== gi))
              }}
            />
          </div>

          <div className="space-y-3">
            {g.items.map((it, ii) => (
              <div key={ii} className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="mb-2 flex items-start gap-2">
                  <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[12rem_1fr]">
                    <label>
                      <Label>Row key</Label>
                      <input className={`${input} font-mono text-xs`} value={it.label} onChange={(e) => setItem(gi, ii, { label: specKey(e.target.value) })} />
                    </label>
                    {it.label ? <L10nField label="Row name" value={labels[it.label] ?? {}} onChange={(v) => setLabel(it.label, v)} /> : null}
                  </div>
                  <ListControls
                    index={ii}
                    length={g.items.length}
                    what={`row ${ii + 1}`}
                    onMove={(d) => setGroup(gi, { items: move(g.items, ii, d) })}
                    onRemove={() => setGroup(gi, { items: g.items.filter((_, i) => i !== ii) })}
                  />
                </div>
                <label className="mb-2 block">
                  <Label hint="source / fallback text">Value</Label>
                  <input className={input} value={it.value} onChange={(e) => setItem(gi, ii, { value: e.target.value })} />
                </label>
                <L10nField label="Value per language" hint="optional, overrides the value above" value={it.valueL10n ?? {}} onChange={(v) => setItem(gi, ii, { valueL10n: v })} />
              </div>
            ))}
            <button type="button" className={`${btnGhost} ${btnSm}`} onClick={() => setGroup(gi, { items: [...g.items, { label: '', value: '' }] })}>
              <Plus size={14} /> Add row
            </button>
          </div>
        </fieldset>
      ))}
      <button type="button" className={`${btnGhost} ${btnSm}`} onClick={() => onChange([...groups, { group: '', items: [{ label: '', value: '' }] }])}>
        <Plus size={14} /> Add group
      </button>
    </div>
  )
}
