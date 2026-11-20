'use client'

import { EyeOff, Plus, RotateCcw } from 'lucide-react'
import type { FaqItem, Highlight, Section } from '@/lib/catalog'
import type { L10n } from '@/lib/localized'
import { btnGhost, btnSm, input, Label } from './ui'
import L10nField from './L10nField'
import ListControls, { move } from './ListControls'

type ListProps<T> = { items: T[]; onChange: (v: T[]) => void }

type Sourced = { sourceKey?: string; hidden?: boolean }

/**
 * One list row. Imported items (with a sourceKey) are hidden instead of deleted, so a re-import from the
 * source page does not bring them back; a hidden row shows collapsed with a Restore button.
 */
function Row({ children, i, n, items, onChange, what, summary }: { children: React.ReactNode; i: number; n: number; items: unknown[]; onChange: (v: never[]) => void; what: string; summary?: string }) {
  const item = items[i] as Sourced
  const setHidden = (hidden: boolean) =>
    onChange(
      items.map((x, j) => {
        if (j !== i) return x
        const { hidden: _drop, ...rest } = x as Sourced & Record<string, unknown>
        return hidden ? { ...rest, hidden: true } : rest
      }) as never[],
    )
  if (item?.hidden) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-white p-3 text-sm text-neutral-500">
        <EyeOff size={16} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-neutral-700">{summary || what}</span> — hidden; re-import won&apos;t bring it back
        </span>
        <button type="button" className={`${btnGhost} ${btnSm}`} onClick={() => setHidden(false)}>
          <RotateCcw size={14} /> Restore
        </button>
      </div>
    )
  }
  const imported = Boolean(item?.sourceKey)
  return (
    <div className="flex items-start gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <div className="min-w-0 flex-1 space-y-3">{children}</div>
      <ListControls
        index={i}
        length={n}
        what={what}
        removeLabel={imported ? `Hide ${what} (imported)` : undefined}
        onMove={(d) => onChange(move(items, i, d) as never[])}
        onRemove={() => (imported ? setHidden(true) : onChange(items.filter((_, j) => j !== i) as never[]))}
      />
    </div>
  )
}

const AddBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" className={`${btnGhost} ${btnSm}`} onClick={onClick}>
    <Plus size={14} /> {children}
  </button>
)

export function SectionsEditor({ items, onChange }: ListProps<Section>) {
  const set = (i: number, p: Partial<Section>) => onChange(items.map((s, j) => (j === i ? { ...s, ...p } : s)))
  return (
    <div className="space-y-3">
      {items.map((s, i) => (
        <Row key={i} i={i} n={items.length} items={items} onChange={onChange as never} what={`section ${i + 1}`} summary={s.heading?.en || s.image}>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={s.layout === 'banner'}
              onChange={(e) => {
                const { layout: _l, ...rest } = s
                onChange(items.map((x, j) => (j === i ? (e.target.checked ? { ...rest, layout: 'banner' as const } : rest) : x)))
              }}
            />
            Full-width banner (image shown edge to edge, heading and text above it)
          </label>
          <L10nField label="Heading" value={s.heading} onChange={(heading) => set(i, { heading })} />
          <L10nField label="Text" multiline rows={4} value={s.body} onChange={(body) => set(i, { body })} />
          <label className="block">
            <Label hint={s.layout === 'banner' ? 'required for a banner, http(s) URL' : 'optional http(s) URL'}>Image</Label>
            <input className={`${input} font-mono text-xs`} value={s.image ?? ''} onChange={(e) => set(i, { image: e.target.value })} />
          </label>
          {s.layout === 'banner' && (
            <label className="block">
              <Label hint="optional http(s) URL, shown on phones">Mobile image</Label>
              <input className={`${input} font-mono text-xs`} value={s.imageMobile ?? ''} onChange={(e) => set(i, { imageMobile: e.target.value || undefined })} />
            </label>
          )}
          {s.sourceKey && <p className="text-xs text-neutral-500">Imported from the source page. Removing hides it, so re-import won&apos;t add it again.</p>}
        </Row>
      ))}
      <AddBtn onClick={() => onChange([...items, { heading: {}, body: {} }])}>Add section</AddBtn>
    </div>
  )
}

export function HighlightsEditor({ items, onChange }: ListProps<Highlight>) {
  const set = (i: number, p: Partial<Highlight>) => onChange(items.map((s, j) => (j === i ? { ...s, ...p } : s)))
  return (
    <div className="space-y-3">
      {items.map((h, i) => (
        <Row key={i} i={i} n={items.length} items={items} onChange={onChange as never} what={`highlight ${i + 1}`}>
          <L10nField label="Title" value={h.title} onChange={(title) => set(i, { title })} />
          <label className="block max-w-xs">
            <Label hint="big number, e.g. 100W">Value</Label>
            <input className={input} value={h.value ?? ''} onChange={(e) => set(i, { value: e.target.value })} />
          </label>
        </Row>
      ))}
      <AddBtn onClick={() => onChange([...items, { title: {} }])}>Add highlight</AddBtn>
    </div>
  )
}

export function InTheBoxEditor({ items, onChange }: ListProps<L10n>) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <Row key={i} i={i} n={items.length} items={items} onChange={onChange as never} what={`item ${i + 1}`}>
          <L10nField label={`Item ${i + 1}`} value={it} onChange={(v) => onChange(items.map((x, j) => (j === i ? v : x)))} />
        </Row>
      ))}
      <AddBtn onClick={() => onChange([...items, {}])}>Add item</AddBtn>
    </div>
  )
}

export function FaqEditor({ items, onChange }: ListProps<FaqItem>) {
  const set = (i: number, p: Partial<FaqItem>) => onChange(items.map((s, j) => (j === i ? { ...s, ...p } : s)))
  return (
    <div className="space-y-3">
      {items.map((f, i) => (
        <Row key={i} i={i} n={items.length} items={items} onChange={onChange as never} what={`question ${i + 1}`} summary={f.q?.en}>
          <L10nField label="Question" value={f.q} onChange={(q) => set(i, { q })} />
          <L10nField label="Answer" multiline rows={3} value={f.a} onChange={(a) => set(i, { a })} />
        </Row>
      ))}
      <AddBtn onClick={() => onChange([...items, { q: {}, a: {} }])}>Add question</AddBtn>
    </div>
  )
}
