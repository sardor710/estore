'use client'

import { Plus } from 'lucide-react'
import type { VariantInput } from '@/lib/admin/products-shared'
import { btnGhost, btnSm, input, Label } from './ui'
import L10nField from './L10nField'
import ListControls, { move } from './ListControls'

const toInt = (s: string): number => (s.trim() === '' ? 0 : Number(s))
const toIntOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s))

export default function VariantEditor({
  variants,
  onChange,
  imageCount,
  images,
}: {
  variants: VariantInput[]
  onChange: (v: VariantInput[]) => void
  imageCount: number
  images: string[]
}) {
  const set = (i: number, patch: Partial<VariantInput>) => onChange(variants.map((v, j) => (j === i ? { ...v, ...patch } : v)))
  return (
    <div className="space-y-3">
      {variants.length === 0 ? <p className="text-sm text-amber-700">No variants yet. A product needs at least one variant (with a price) to be published.</p> : null}
      {variants.map((v, i) => (
        <fieldset key={v.id ?? `new-${i}`} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <legend className="px-1 text-xs font-bold text-neutral-500">Variant {i + 1}</legend>
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <L10nField label="Name" value={v.name} onChange={(name) => set(i, { name })} />
            </div>
            <ListControls
              index={i}
              length={variants.length}
              what={`variant ${i + 1}`}
              onMove={(d) => onChange(move(variants, i, d))}
              onRemove={() => {
                if (window.confirm(`Remove variant ${v.sku || i + 1}?`)) onChange(variants.filter((_, j) => j !== i))
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <label>
              <Label>SKU</Label>
              <input className={input} value={v.sku} onChange={(e) => set(i, { sku: e.target.value })} />
            </label>
            <label>
              <Label hint="UZS">Price</Label>
              <input className={input} inputMode="numeric" value={String(v.priceUzs)} onChange={(e) => set(i, { priceUzs: toInt(e.target.value) })} />
            </label>
            <label>
              <Label hint="UZS, optional">Compare-at</Label>
              <input className={input} inputMode="numeric" value={v.compareAtUzs === null ? '' : String(v.compareAtUzs)} onChange={(e) => set(i, { compareAtUzs: toIntOrNull(e.target.value) })} />
            </label>
            <label>
              <Label>Stock</Label>
              <input className={input} inputMode="numeric" value={String(v.stock)} onChange={(e) => set(i, { stock: toInt(e.target.value) })} />
            </label>
            <label>
              <Label>Color</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Pick color"
                  className="h-9 w-10 shrink-0 cursor-pointer rounded border border-neutral-300 bg-white p-0.5"
                  value={v.colorHex ?? '#000000'}
                  onChange={(e) => set(i, { colorHex: e.target.value })}
                />
                <input className={input} placeholder="#aabbcc" value={v.colorHex ?? ''} onChange={(e) => set(i, { colorHex: e.target.value.trim() === '' ? null : e.target.value })} />
              </div>
            </label>
            <label>
              <Label hint={`0..${Math.max(imageCount - 1, 0)}`}>Image #</Label>
              <div className="flex items-center gap-2">
                <input className={input} inputMode="numeric" placeholder="none" value={v.imageIndex === null ? '' : String(v.imageIndex)} onChange={(e) => set(i, { imageIndex: toIntOrNull(e.target.value) })} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {v.imageIndex !== null && images[v.imageIndex] ? <img src={images[v.imageIndex]} alt="" className="h-9 w-9 shrink-0 rounded object-cover" /> : null}
              </div>
            </label>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className={`${btnGhost} ${btnSm}`}
        onClick={() => onChange([...variants, { sku: '', name: {}, priceUzs: 0, compareAtUzs: null, stock: 0, colorHex: null, imageIndex: null }])}
      >
        <Plus size={14} /> Add variant
      </button>
    </div>
  )
}
