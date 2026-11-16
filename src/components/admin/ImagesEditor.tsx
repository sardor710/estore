'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { isHttpUrlClient } from './url'
import { btnGhost, btnSm, input } from './ui'
import ListControls, { move } from './ListControls'

export default function ImagesEditor({ images, onChange }: { images: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function add() {
    const v = draft.trim()
    if (!v) return
    if (!isHttpUrlClient(v)) return setErr('Only http:// or https:// image URLs are allowed.')
    setErr(null)
    onChange([...images, v])
    setDraft('')
  }

  return (
    <div className="space-y-2">
      {images.length === 0 ? <p className="text-sm text-neutral-500">No images. The first image is the product cover.</p> : null}
      <ul className="space-y-2">
        {images.map((src, i) => (
          <li key={`${src}-${i}`} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-2">
            {isHttpUrlClient(src) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-white object-cover" />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-lg bg-red-100" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-neutral-500">#{i}{i === 0 ? ' (cover)' : ''}</div>
              <input
                aria-label={`Image ${i} URL`}
                className={`${input} !py-1 font-mono text-xs`}
                value={src}
                onChange={(e) => onChange(images.map((s, j) => (j === i ? e.target.value : s)))}
              />
            </div>
            <ListControls index={i} length={images.length} what={`image ${i}`} onMove={(d) => onChange(move(images, i, d))} onRemove={() => onChange(images.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          className={`${input} font-mono text-xs`}
          placeholder="https://..."
          value={draft}
          aria-label="New image URL"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button type="button" className={`${btnGhost} ${btnSm} shrink-0`} onClick={add}>
          <Plus size={14} /> Add
        </button>
      </div>
      {err ? <p role="alert" className="text-sm text-red-700">{err}</p> : null}
      <p className="text-xs text-neutral-500">Reordering changes which image a variant's "Image #" points at.</p>
    </div>
  )
}
