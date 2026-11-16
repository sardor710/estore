'use client'

import { Plus } from 'lucide-react'
import type { FaqItem, Highlight, Section } from '@/lib/catalog'
import type { L10n } from '@/lib/localized'
import { btnGhost, btnSm, input, Label } from './ui'
import L10nField from './L10nField'
import ListControls, { move } from './ListControls'

type ListProps<T> = { items: T[]; onChange: (v: T[]) => void }

function Row({ children, i, n, items, onChange, what }: { children: React.ReactNode; i: number; n: number; items: unknown[]; onChange: (v: never[]) => void; what: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <div className="min-w-0 flex-1 space-y-3">{children}</div>
      <ListControls
        index={i}
        length={n}
        what={what}
        onMove={(d) => onChange(move(items, i, d) as never[])}
        onRemove={() => onChange(items.filter((_, j) => j !== i) as never[])}
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
        <Row key={i} i={i} n={items.length} items={items} onChange={onChange as never} what={`section ${i + 1}`}>
          <L10nField label="Heading" value={s.heading} onChange={(heading) => set(i, { heading })} />
          <L10nField label="Text" multiline rows={4} value={s.body} onChange={(body) => set(i, { body })} />
          <label className="block">
            <Label hint="optional http(s) URL">Image</Label>
            <input className={`${input} font-mono text-xs`} value={s.image ?? ''} onChange={(e) => set(i, { image: e.target.value })} />
          </label>
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
        <Row key={i} i={i} n={items.length} items={items} onChange={onChange as never} what={`question ${i + 1}`}>
          <L10nField label="Question" value={f.q} onChange={(q) => set(i, { q })} />
          <L10nField label="Answer" multiline rows={3} value={f.a} onChange={(a) => set(i, { a })} />
        </Row>
      ))}
      <AddBtn onClick={() => onChange([...items, { q: {}, a: {} }])}>Add question</AddBtn>
    </div>
  )
}
