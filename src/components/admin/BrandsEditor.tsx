'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteBrandAction, saveBrandAction } from '@/app/admin/actions/brands'
import type { BrandInput, BrandRow } from '@/lib/admin/brands'
import { btn, btnDanger, btnGhost, btnSm, card, input, Label, Notice } from './ui'

type Msg = { kind: 'ok' | 'error'; text: string } | null
type Draft = { name: string; slug: string; logoUrl: string; sortOrder: string }

const toDraft = (b?: BrandRow): Draft => ({ name: b?.name ?? '', slug: b?.slug ?? '', logoUrl: b?.logoUrl ?? '', sortOrder: String(b?.sortOrder ?? 0) })
const toInput = (d: Draft, id?: number): BrandInput => ({ id, name: d.name, slug: d.slug, logoUrl: d.logoUrl, sortOrder: Number.parseInt(d.sortOrder, 10) || 0 })

function Fields({ draft, onChange, idPrefix }: { draft: Draft; onChange: (d: Draft) => void; idPrefix: string }) {
  const set = (p: Partial<Draft>) => onChange({ ...draft, ...p })
  return (
    <div className="grid flex-1 gap-3 sm:grid-cols-[2fr_2fr_3fr_1fr]">
      <label htmlFor={`${idPrefix}-name`}>
        <Label>Name</Label>
        <input id={`${idPrefix}-name`} className={input} value={draft.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label htmlFor={`${idPrefix}-slug`}>
        <Label hint="blank = from name">Slug</Label>
        <input id={`${idPrefix}-slug`} className={input} value={draft.slug} onChange={(e) => set({ slug: e.target.value })} />
      </label>
      <label htmlFor={`${idPrefix}-logo`}>
        <Label hint="optional">Logo URL</Label>
        <input id={`${idPrefix}-logo`} className={input} value={draft.logoUrl} placeholder="https://... or /uploads/..." onChange={(e) => set({ logoUrl: e.target.value })} />
      </label>
      <label htmlFor={`${idPrefix}-sort`}>
        <Label>Order</Label>
        <input id={`${idPrefix}-sort`} className={input} type="number" step={1} value={draft.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} />
      </label>
    </div>
  )
}

export default function BrandsEditor({ brands }: { brands: BrandRow[] }) {
  const router = useRouter()
  const [msg, setMsg] = useState<Msg>(null)
  const [pending, start] = useTransition()
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [fresh, setFresh] = useState<Draft>(toDraft())

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string, after?: () => void) {
    setMsg(null)
    start(async () => {
      const r = await action()
      if (!r.ok) return setMsg({ kind: 'error', text: r.error })
      setMsg({ kind: 'ok', text: okText })
      after?.()
      router.refresh()
    })
  }

  const dropDraft = (id: number) =>
    setDrafts((d) => {
      const { [id]: _, ...rest } = d
      return rest
    })

  return (
    <div className="space-y-6">
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}

      <section className={card} aria-labelledby="brand-list">
        <h2 id="brand-list" className="mb-3 font-bold">
          Brands
        </h2>
        {brands.length === 0 ? <p className="text-sm text-neutral-500">No brands yet.</p> : null}
        <ul className="divide-y divide-neutral-200">
          {brands.map((b) => {
            const draft = drafts[b.id]
            return (
              <li key={b.id} className="flex flex-wrap items-end gap-3 py-3">
                {draft ? (
                  <Fields draft={draft} onChange={(d) => setDrafts((all) => ({ ...all, [b.id]: d }))} idPrefix={`brand-${b.id}`} />
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {b.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded bg-neutral-100 object-contain" />
                    ) : null}
                    <div className="min-w-0">
                      <div className="font-semibold text-neutral-900">{b.name}</div>
                      <div className="text-xs text-neutral-500">
                        /{b.slug} · order {b.sortOrder} · {b.productCount} product{b.productCount === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  {draft ? (
                    <>
                      <button type="button" className={`${btn} ${btnSm}`} disabled={pending} onClick={() => run(() => saveBrandAction(toInput(draft, b.id)), `Saved ${draft.name.trim()}.`, () => dropDraft(b.id))}>
                        Save
                      </button>
                      <button type="button" className={`${btnGhost} ${btnSm}`} disabled={pending} onClick={() => dropDraft(b.id)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className={`${btnGhost} ${btnSm}`} disabled={pending} onClick={() => setDrafts((all) => ({ ...all, [b.id]: toDraft(b) }))}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className={`${btnDanger} ${btnSm}`}
                        disabled={pending || b.productCount > 0}
                        title={b.productCount > 0 ? 'Used by products: change their brand first' : undefined}
                        onClick={() => {
                          if (confirm(`Delete brand "${b.name}"?`)) run(() => deleteBrandAction(b.id), `Deleted ${b.name}.`)
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <form
        className={card}
        aria-labelledby="brand-add"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => saveBrandAction(toInput(fresh)), `Created ${fresh.name.trim()}.`, () => setFresh(toDraft()))
        }}
      >
        <h2 id="brand-add" className="mb-3 font-bold">
          Add brand
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <Fields draft={fresh} onChange={setFresh} idPrefix="brand-new" />
          <button type="submit" className={btn} disabled={pending || !fresh.name.trim()}>
            Add
          </button>
        </div>
      </form>
    </div>
  )
}
