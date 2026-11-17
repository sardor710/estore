'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { updateCustomerAction } from '@/app/admin/actions/clients'
import { btn, btnDanger, btnGhost, card, input, Label, Notice } from './ui'

type Props = { id: number; notes: string; tags: string[]; blocked: boolean }

/** Notes, tags and the blocked flag of one client. Blocking refuses new online orders from this phone number. */
export default function ClientEditor({ id, notes: initialNotes, tags: initialTags, blocked: initialBlocked }: Props) {
  const router = useRouter()
  const [notes, setNotes] = useState(initialNotes)
  const [tags, setTags] = useState(initialTags)
  const [draft, setDraft] = useState('')
  const [blocked, setBlocked] = useState(initialBlocked)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  function addTag() {
    const t = draft.trim()
    if (t && !tags.includes(t)) setTags([...tags, t])
    setDraft('')
  }

  function run(patch: { notes?: string; tags?: string[]; blocked?: boolean }, onOk?: () => void) {
    setError(null)
    setSaved(false)
    start(async () => {
      const r = await updateCustomerAction(id, patch)
      if (!r.ok) return setError(r.error)
      onOk?.()
      setSaved(true)
      router.refresh()
    })
  }

  function toggleBlocked() {
    const next = !blocked
    if (next && !confirm('Block this client? Online orders from this phone number will be refused.')) return
    run({ blocked: next }, () => setBlocked(next))
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    // A tag typed but not yet added is kept rather than silently dropped.
    const t = draft.trim()
    const nextTags = t && !tags.includes(t) ? [...tags, t] : tags
    run({ notes, tags: nextTags }, () => {
      setTags(nextTags)
      setDraft('')
    })
  }

  return (
    <div className="space-y-4">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {saved && !error ? <Notice kind="ok">Saved.</Notice> : null}

      <form onSubmit={save} className={`${card} space-y-4`}>
        <label className="block">
          <Label hint="Internal only">Notes</Label>
          <textarea className={input} rows={4} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div>
          <Label hint="Press Enter to add">Tags</Label>
          {tags.length > 0 ? (
            <ul className="mb-2 flex flex-wrap gap-2">
              {tags.map((t) => (
                <li key={t} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pl-3 pr-1 text-sm font-medium text-indigo-800 ring-1 ring-inset ring-indigo-200">
                  {t}
                  <button
                    type="button"
                    className="rounded-full p-1 text-indigo-700 hover:bg-indigo-100"
                    aria-label={`Remove tag ${t}`}
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <input
            className={input}
            value={draft}
            maxLength={30}
            placeholder="e.g. wholesale"
            aria-label="New tag"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
          />
        </div>
        <button type="submit" disabled={pending} className={btn}>
          {pending ? 'Saving...' : 'Save notes and tags'}
        </button>
      </form>

      <div className={`${card} space-y-3`}>
        <h2 className="text-base font-semibold text-neutral-900">Online orders</h2>
        <p className="text-sm text-neutral-600">
          {blocked
            ? 'This client is blocked: online orders from this phone number are refused and they are told to call the shop.'
            : 'Blocking refuses online orders from this phone number. The client sees only a generic "please call us" message.'}
        </p>
        <button type="button" disabled={pending} onClick={toggleBlocked} className={blocked ? btnGhost : btnDanger}>
          {blocked ? 'Unblock client' : 'Block client'}
        </button>
      </div>
    </div>
  )
}
