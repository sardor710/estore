'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deletePromotionAction, savePromotionAction, togglePromotionAction } from '@/app/admin/actions/promotions'
import type { PromoKind, PromoTargetType, PromotionInput, TargetOption } from '@/lib/admin/promotions'
import { bestPrice } from '@/lib/pricing'
import TargetPicker from './TargetPicker'
import { btn, btnDanger, btnGhost, card, input, Label, Notice } from './ui'

const NOUN: Record<PromoTargetType, string> = { PRODUCT: 'products', CATEGORY: 'categories', BRAND: 'brands' }
const EXAMPLE_PRICE = 1_290_000

/** 1290000 -> "1 290 000" */
const spaced = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

const EMPTY: PromotionInput = { name: '', kind: 'PERCENT', value: 10, targetType: 'CATEGORY', targetIds: [], enabled: true, startsAt: null, endsAt: null }

export default function PromotionEditor({ initial, options }: { initial: PromotionInput | null; options: Record<PromoTargetType, TargetOption[]> }) {
  const router = useRouter()
  const [data, setData] = useState<PromotionInput>(initial ?? EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [example, setExample] = useState(EXAMPLE_PRICE)
  const [pending, start] = useTransition()
  const patch = (p: Partial<PromotionInput>) => setData((d) => ({ ...d, ...p }))

  const valueOk = Number.isInteger(data.value) && data.value >= 1 && (data.kind === 'AMOUNT' || data.value <= 90)
  const preview = valueOk
    ? bestPrice(
        { priceUzs: example, productId: 0, categoryIds: [], brandId: null },
        [{ id: 1, kind: data.kind, value: data.value, targetType: 'PRODUCT', targetIds: [0], enabled: true, startsAt: null, endsAt: null }],
        new Date(),
      )
    : null

  function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    start(async () => {
      const r = await savePromotionAction({ ...data, startsAt: data.startsAt || null, endsAt: data.endsAt || null })
      if (!r.ok) return setError(r.error)
      router.push('/admin/promotions')
      router.refresh()
    })
  }

  function remove() {
    if (data.id === undefined || !confirm(`Delete promotion "${data.name}"? Past orders keep their recorded discount.`)) return
    const id = data.id
    start(async () => {
      const r = await deletePromotionAction(id)
      if (!r.ok) return setError(r.error)
      router.push('/admin/promotions')
      router.refresh()
    })
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {error ? <Notice kind="error">{error}</Notice> : null}

      <section className={`${card} grid gap-4 sm:grid-cols-2`} aria-label="Discount">
        <label className="sm:col-span-2">
          <Label>Name</Label>
          <input className={input} value={data.name} maxLength={100} required onChange={(e) => patch({ name: e.target.value })} />
        </label>
        <label>
          <Label>Discount type</Label>
          <select className={input} value={data.kind} onChange={(e) => patch({ kind: e.target.value as PromoKind })}>
            <option value="PERCENT">Percent off</option>
            <option value="AMOUNT">Fixed amount off (so&apos;m)</option>
          </select>
        </label>
        <label>
          <Label hint={data.kind === 'PERCENT' ? '1 to 90' : 'whole soʻm, at least 1'}>Value</Label>
          <input
            className={input}
            type="number"
            inputMode="numeric"
            min={1}
            max={data.kind === 'PERCENT' ? 90 : undefined}
            step={1}
            value={Number.isNaN(data.value) ? '' : data.value}
            onChange={(e) => patch({ value: e.target.value === '' ? NaN : Number(e.target.value) })}
          />
        </label>
        <div className="sm:col-span-2 rounded-xl bg-neutral-50 px-4 py-3 text-sm" aria-live="polite">
          <span className="text-neutral-500">Example: </span>
          <label className="inline-flex items-center gap-1">
            <span className="sr-only">Example price</span>
            <input
              className="w-32 rounded border border-neutral-300 px-2 py-0.5 text-right"
              type="number"
              min={0}
              step="any"
              value={example}
              onChange={(e) => setExample(Math.max(0, Math.round(Number(e.target.value) || 0)))}
            />
          </label>
          {preview ? (
            <span className="ml-2 font-semibold">
              {spaced(preview.originalUzs)} &rarr; {spaced(preview.priceUzs)}
              {preview.priceUzs === 1000 && preview.originalUzs > 1000 ? <span className="ml-2 font-normal text-neutral-500">(never below 1 000)</span> : null}
            </span>
          ) : (
            <span className="ml-2 text-red-700">Enter a valid value</span>
          )}
        </div>
      </section>

      <section className={card} aria-label="Applies to">
        <label className="mb-3 block">
          <Label>Applies to</Label>
          <select
            className={`${input} sm:w-64`}
            value={data.targetType}
            onChange={(e) => patch({ targetType: e.target.value as PromoTargetType, targetIds: [] })}
          >
            <option value="PRODUCT">Products</option>
            <option value="CATEGORY">Categories (including subcategories)</option>
            <option value="BRAND">Brands</option>
          </select>
        </label>
        <TargetPicker options={options[data.targetType]} value={data.targetIds} onChange={(targetIds) => patch({ targetIds })} noun={NOUN[data.targetType]} />
      </section>

      <section className={`${card} grid gap-4 sm:grid-cols-2`} aria-label="Schedule">
        <label>
          <Label hint="Tashkent time, optional">Starts</Label>
          <input className={input} type="datetime-local" value={data.startsAt ?? ''} onChange={(e) => patch({ startsAt: e.target.value || null })} />
        </label>
        <label>
          <Label hint="Tashkent time, optional">Ends</Label>
          <input className={input} type="datetime-local" value={data.endsAt ?? ''} onChange={(e) => patch({ endsAt: e.target.value || null })} />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={data.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
          Enabled
        </label>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        {data.id !== undefined ? (
          <button type="button" className={`${btnDanger} mr-auto`} onClick={remove} disabled={pending}>
            Delete
          </button>
        ) : null}
        <button type="button" className={btnGhost} onClick={() => router.push('/admin/promotions')} disabled={pending}>
          Cancel
        </button>
        <button type="submit" className={btn} disabled={pending}>
          {pending ? 'Saving...' : 'Save promotion'}
        </button>
      </div>
    </form>
  )
}

/** On/off switch for the promotions table. */
export function PromotionSwitch({ id, name, enabled }: { id: number; name: string; enabled: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${name}: ${enabled ? 'on' : 'off'}`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await togglePromotionAction(id, !enabled)
            if (!r.ok) setError(r.error)
            router.refresh()
          })
        }
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${enabled ? 'bg-green-600' : 'bg-neutral-300'}`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
      {error ? <span role="alert" className="mt-1 text-xs text-red-700">{error}</span> : null}
    </span>
  )
}
