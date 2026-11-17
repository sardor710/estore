'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ImageOff, Plus } from 'lucide-react'
import { locales } from '@/i18n/routing'
import type { VariantInput } from '@/lib/admin/products-shared'
import { variantThumb } from '@/lib/admin/variant-display'
import { btnGhost, btnSm, input, Label } from './ui'
import L10nField from './L10nField'
import ListControls, { move } from './ListControls'

const toInt = (s: string): number => (s.trim() === '' ? 0 : Number(s))
const toIntOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s))

/** Display name for a variant in the editor: en, then uz, then ru; null when it has none. */
function variantName(v: VariantInput): string | null {
  for (const l of ['en', 'uz', 'ru'] as const) {
    const s = v.name[l]?.trim()
    if (s) return s
  }
  return null
}

function Swatch({ hex, size = 'h-4 w-4' }: { hex: string | null; size?: string }) {
  if (!hex) return null
  return <span aria-hidden className={`${size} shrink-0 rounded-full border border-neutral-300 shadow-inner`} style={{ backgroundColor: hex }} />
}

/** Radio-group of the product's images (plus "None") that sets which picture a variant shows. */
function ImagePicker({ images, value, onChange, label }: { images: string[]; value: number | null; onChange: (v: number | null) => void; label: string }) {
  const name = useId()
  const gridId = useId()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const gridRef = useRef<HTMLFieldSetElement>(null)
  const toggled = useRef(false)
  // Keep keyboard focus in place when the picker swaps between its compact and open views.
  useEffect(() => {
    if (!toggled.current) return
    toggled.current = false
    if (open) (gridRef.current?.querySelector<HTMLInputElement>('input:checked') ?? gridRef.current?.querySelector<HTMLInputElement>('input'))?.focus()
    else triggerRef.current?.focus()
  }, [open])
  const toggle = (v: boolean) => {
    toggled.current = true
    setOpen(v)
  }
  const current = value !== null && images[value] ? images[value] : null
  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current} alt="" className="h-full w-full object-contain" />
          ) : (
            <ImageOff size={18} className="text-neutral-400" aria-hidden />
          )}
        </div>
        <div className="text-xs text-neutral-600">
          <div>{current ? `Image ${value! + 1}${value === 0 ? ' (cover)' : ''}` : 'None — uses the cover'}</div>
          <button type="button" className={`${btnGhost} ${btnSm} mt-1`} ref={triggerRef} aria-expanded={false} onClick={() => toggle(true)} disabled={images.length === 0}>
            {images.length ? "Change picture" : "Add images first"}
          </button>
        </div>
      </div>
    )
  }
  const tile = (selected: boolean) =>
    `relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border bg-white transition focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-2 ${
      selected ? 'border-indigo-600 ring-2 ring-indigo-600' : 'border-neutral-200 hover:border-neutral-400'
    }`
  return (
    <fieldset id={gridId} ref={gridRef}>
      <legend className="sr-only">{label}</legend>
      <div className="flex max-h-72 flex-wrap gap-2 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 p-2">
        <label className={tile(value === null)} title="No picture of its own (uses the cover)">
          <input type="radio" name={name} className="sr-only" checked={value === null} onChange={() => onChange(null)} />
          <span className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-neutral-500">
            <ImageOff size={16} aria-hidden />
            None
          </span>
        </label>
        {images.map((src, i) => (
          <label key={`${src}-${i}`} className={tile(value === i)} title={`Image ${i + 1}${i === 0 ? ' (cover)' : ''}`}>
            <input type="radio" name={name} className="sr-only" checked={value === i} onChange={() => onChange(i)} aria-label={`Image ${i + 1}${i === 0 ? ' (cover)' : ''}`} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" loading="lazy" className="h-full w-full object-contain" />
            <span className="absolute bottom-0.5 right-0.5 rounded bg-white/90 px-1 text-[9px] font-bold text-neutral-600">{i + 1}</span>
          </label>
        ))}
      </div>
      <button type="button" className={`${btnGhost} ${btnSm} mt-2`} aria-expanded aria-controls={gridId} onClick={() => toggle(false)}>
        Done
      </button>
    </fieldset>
  )
}

export default function VariantEditor({
  variants,
  onChange,
  images,
}: {
  variants: VariantInput[]
  onChange: (v: VariantInput[]) => void
  /** Kept for callers; the picker uses `images`. */
  imageCount?: number
  images: string[]
}) {
  const set = (i: number, patch: Partial<VariantInput>) => onChange(variants.map((v, j) => (j === i ? { ...v, ...patch } : v)))
  const several = variants.length > 1
  return (
    <div className="space-y-3">
      {variants.length === 0 ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">No variants yet. A product needs at least one variant (with a price) to be published.</p> : null}
      {variants.map((v, i) => {
        const name = variantName(v)
        const thumb = variantThumb(images, v.imageIndex)
        const missingNames = locales.filter((l) => !v.name[l]?.trim())
        return (
          <fieldset key={v.id ?? `new-${i}`} className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <legend className="sr-only">Variant {i + 1}: {name || v.sku || 'unnamed'}</legend>
            <div className="flex items-center gap-3 border-b border-neutral-200 bg-neutral-50 px-3 py-2">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-neutral-200 bg-white object-contain" />
              ) : (
                <div className="h-11 w-11 shrink-0 rounded-lg border border-dashed border-neutral-300 bg-white" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Swatch hex={v.colorHex} />
                  <span className={`truncate text-sm font-semibold ${name ? 'text-neutral-900' : 'italic text-neutral-500'}`}>{name ?? 'Unnamed variant'}</span>
                </div>
                <div className="truncate font-mono text-xs text-neutral-500">{v.sku || 'no SKU yet'}</div>
              </div>
              <ListControls
                index={i}
                length={variants.length}
                what={`variant ${name || v.sku || i + 1}`}
                onMove={(d) => onChange(move(variants, i, d))}
                onRemove={() => {
                  if (window.confirm(`Remove variant ${name || v.sku || i + 1}?`)) onChange(variants.filter((_, j) => j !== i))
                }}
              />
            </div>
            <div className="space-y-3 p-3">
              {several && !name ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Give this variant a name (e.g. &ldquo;Black&rdquo; or &ldquo;With 1.5 m cable&rdquo;) so staff and customers can tell the options apart.
                </p>
              ) : null}
              <L10nField label="Name" hint={several && missingNames.length && name ? `missing: ${missingNames.join(', ')}` : undefined} value={v.name} onChange={(n) => set(i, { name: n })} />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <label>
                  <Label>SKU</Label>
                  <input className={`${input} font-mono`} value={v.sku} onChange={(e) => set(i, { sku: e.target.value })} />
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
              </div>
              <div className="grid gap-3 md:grid-cols-[14rem_minmax(0,1fr)]">
                <div>
                  <Label hint="optional">Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      aria-label={`Pick color for variant ${i + 1}`}
                      className="h-[38px] w-11 shrink-0 cursor-pointer rounded-lg border border-neutral-300 bg-white p-1 shadow-xs hover:border-neutral-400"
                      value={v.colorHex ?? '#000000'}
                      onChange={(e) => set(i, { colorHex: e.target.value })}
                    />
                    <input
                      className={input}
                      aria-label={`Color hex for variant ${i + 1}`}
                      placeholder="#aabbcc"
                      value={v.colorHex ?? ''}
                      onChange={(e) => set(i, { colorHex: e.target.value.trim() === '' ? null : e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label hint="shown when a customer picks this variant">Picture</Label>
                  <ImagePicker images={images} value={v.imageIndex} onChange={(imageIndex) => set(i, { imageIndex })} label={`Picture for variant ${i + 1}`} />
                </div>
              </div>
            </div>
          </fieldset>
        )
      })}
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
