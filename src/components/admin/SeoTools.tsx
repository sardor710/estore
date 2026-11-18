'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { autoSeoAction } from '@/app/admin/actions/seo'
import { btn, btnGhost, btnSm, Notice } from './ui'

/** Whole-catalog buttons: fill blank SEO texts, or rewrite all of them. */
export default function SeoTools({ total, withIssues }: { total: number; withIssues: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const run = (overwrite: boolean) => {
    if (overwrite && !window.confirm('Rewrite the SEO texts of ALL products? Texts you wrote by hand will be replaced.')) return
    setMsg(null)
    start(async () => {
      const r = await autoSeoAction({ overwrite })
      setMsg(r.changed ? `Updated ${r.changed} product(s).` : 'Nothing to change.')
      router.refresh()
    })
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-700">
        {total} product(s), {withIssues} with something to fix.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={pending || total === 0} onClick={() => run(false)}>
          <Sparkles size={16} aria-hidden /> {pending ? 'Working…' : 'Auto SEO: fill missing'}
        </button>
        <button type="button" className={btnGhost} disabled={pending || total === 0} onClick={() => run(true)}>
          Rewrite all
        </button>
      </div>
      <p className="text-xs text-neutral-500">“Fill missing” keeps texts you wrote and fills only blank ones. A language with no product title (for example no Russian title yet) is skipped.</p>
      {msg ? <Notice kind="ok">{msg}</Notice> : null}
    </div>
  )
}

/** One product: fill blank SEO texts (or regenerate them when nothing is missing). */
export function SeoRowButton({ id, hasIssues }: { id: number; hasIssues: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      className={`${btnGhost} ${btnSm}`}
      disabled={pending}
      onClick={() => {
        if (!hasIssues && !window.confirm('Regenerate this product’s SEO texts? Texts you wrote will be replaced.')) return
        start(async () => {
          // Fill blanks first; if nothing was blank, the product's problems are lengths, so rewrite.
          const r = await autoSeoAction({ overwrite: false, ids: [id] })
          if (!r.changed) await autoSeoAction({ overwrite: true, ids: [id] })
          router.refresh()
        })
      }}
    >
      <Sparkles size={14} aria-hidden /> {pending ? 'Working…' : hasIssues ? 'Fix' : 'Regenerate'}
    </button>
  )
}
