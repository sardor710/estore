'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveCategoryAction } from '@/app/admin/actions'
import type { L10n } from '@/lib/localized'
import { btn, btnGhost, card, input, Label, Notice } from './ui'
import L10nField from './L10nField'

export type CategoryRow = { id: number | null; slug: string; name: L10n; parentId: number | null; sortOrder: number; template: 'SIMPLE' | 'DETAILED' }

function CategoryForm({ row, all, onSaved }: { row: CategoryRow; all: { id: number; label: string }[]; onSaved: () => void }) {
  const [v, setV] = useState(row)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [ok, setOk] = useState(false)
  const [pending, start] = useTransition()
  const set = (p: Partial<CategoryRow>) => {
    setV((x) => ({ ...x, ...p }))
    setOk(false)
  }

  function save() {
    start(async () => {
      const r = await saveCategoryAction(v.id, { slug: v.slug, name: v.name, parentId: v.parentId, sortOrder: v.sortOrder, template: v.template })
      if (!r.ok) {
        setErrors(r.errors)
        return setOk(false)
      }
      setErrors({})
      setOk(true)
      onSaved()
    })
  }
  const err = (k: string) => (errors[k] ? <p role="alert" className="mt-1 text-sm text-red-700">{errors[k]}</p> : null)

  return (
    <div className={`${card} space-y-3`}>
      <L10nField label="Name" value={v.name} onChange={(name) => set({ name })} />
      {err('name')}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <label>
          <Label>Slug</Label>
          <input className={`${input} font-mono text-xs`} value={v.slug} onChange={(e) => set({ slug: e.target.value })} />
          {err('slug')}
        </label>
        <label>
          <Label>Parent</Label>
          <select className={input} value={v.parentId ?? ''} onChange={(e) => set({ parentId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">(top level)</option>
            {all.filter((c) => c.id !== v.id).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {err('parentId')}
        </label>
        <label>
          <Label>Order</Label>
          <input className={input} inputMode="numeric" value={String(v.sortOrder)} onChange={(e) => set({ sortOrder: e.target.value.trim() === '' ? 0 : Number(e.target.value) })} />
          {err('sortOrder')}
        </label>
        <label>
          <Label>Template</Label>
          <select className={input} value={v.template} onChange={(e) => set({ template: e.target.value as 'SIMPLE' | 'DETAILED' })}>
            <option value="SIMPLE">SIMPLE</option>
            <option value="DETAILED">DETAILED</option>
          </select>
          {err('template')}
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" className={btnGhost} onClick={save} disabled={pending}>
          {v.id === null ? 'Create category' : 'Save'}
        </button>
        {ok ? <span role="status" className="text-sm text-green-700">Saved</span> : null}
        {errors._ ? <span role="alert" className="text-sm text-red-700">{errors._}</span> : null}
      </div>
    </div>
  )
}

export default function CategoriesEditor({ rows }: { rows: CategoryRow[] }) {
  const router = useRouter()
  const all = rows.map((r) => ({ id: r.id as number, label: r.name.en || r.name.uz || r.slug }))
  const [adding, setAdding] = useState(0)
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <CategoryForm key={`${r.id}`} row={r} all={all} onSaved={() => router.refresh()} />
      ))}
      <h2 className="pt-4 text-base font-semibold text-neutral-900">New category</h2>
      <CategoryForm key={`new-${adding}`} row={{ id: null, slug: '', name: {}, parentId: null, sortOrder: rows.length ? Math.max(...rows.map((r) => r.sortOrder)) + 1 : 0, template: 'SIMPLE' }} all={all} onSaved={() => { setAdding((n) => n + 1); router.refresh() }} />
      {rows.length === 0 ? <Notice kind="info">No categories yet.</Notice> : null}
    </div>
  )
}
