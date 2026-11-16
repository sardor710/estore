'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { importAction, refreshImportAction } from '@/app/admin/actions'
import { btn, btnGhost, card, input, Label, Notice } from './ui'

type Category = { id: number; label: string }
type State =
  | { kind: 'error'; text: string }
  | { kind: 'existing'; productId: number }
  | { kind: 'refreshed'; productId: number }
  | null

export default function ImportForm({ categories, defaultCategoryId }: { categories: Category[]; defaultCategoryId: number | null }) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(defaultCategoryId)
  const [state, setState] = useState<State>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setState(null)
    start(async () => {
      const r = await importAction(url, categoryId)
      if (!r.ok) return setState({ kind: 'error', text: r.message })
      if (!r.created) return setState({ kind: 'existing', productId: r.productId })
      const q = r.notice ? `?notice=${encodeURIComponent(r.notice)}` : ''
      router.push(`/admin/products/${r.productId}${q}`)
    })
  }

  function refresh(productId: number) {
    start(async () => {
      const r = await refreshImportAction(productId)
      setState(r.ok ? { kind: 'refreshed', productId } : { kind: 'error', text: r.message })
    })
  }

  return (
    <form onSubmit={submit} className={`${card} space-y-4`}>
      <label className="block">
        <Label>Anker product URL</Label>
        <input
          className={input}
          type="text"
          inputMode="url"
          placeholder="https://www.anker.com/products/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
      </label>
      <label className="block">
        <Label>Category</Label>
        <select className={input} value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={btn} disabled={pending || !url.trim()}>
        {pending ? 'Working (download + translate, can take a minute)...' : 'Import'}
      </button>

      {state?.kind === 'error' ? <Notice kind="error">{state.text}</Notice> : null}
      {state?.kind === 'existing' || state?.kind === 'refreshed' ? (
        <Notice kind={state.kind === 'refreshed' ? 'ok' : 'info'}>
          <p>{state.kind === 'refreshed' ? 'Refreshed images, specs and English text from Anker. Prices, stock and uz/ru text were not touched.' : 'This URL is already imported.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/admin/products/${state.productId}`} className={btnGhost}>
              Open product
            </Link>
            <button type="button" className={btnGhost} disabled={pending} onClick={() => refresh(state.productId)}>
              {pending ? 'Refreshing...' : 'Refresh from Anker'}
            </button>
          </div>
        </Notice>
      ) : null}
    </form>
  )
}
