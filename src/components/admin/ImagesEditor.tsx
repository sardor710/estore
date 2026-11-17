'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import { ChevronLeft, ChevronRight, ImagePlus, Link2, Loader2, Plus, Star, Trash2, X } from 'lucide-react'
import { isProductImageUrl } from '@/lib/admin/products-shared'
import { uploadAll, type UploadStatus } from '@/lib/admin/upload-queue'
import { Badge, btnGhost, btnSm, input } from './ui'
import { move } from './ListControls'

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

type Row = { id: number; name: string; preview: string | null; status: UploadStatus; detail?: string }

/** Uploads one file through the admin upload endpoint; throws with the server's message on failure. */
async function uploadFile(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('upload', file)
  let res: Response
  try {
    res = await fetch('/api/admin/uploads', { method: 'POST', body: fd })
  } catch {
    throw new Error('Network error. Check your connection and try again.')
  }
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } }
  if (!res.ok || !body.url) throw new Error(body.error?.message ?? 'Upload failed')
  return body.url
}

function hasFiles(e: DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

const tileBtn =
  'inline-flex size-7 sm:size-8 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'

export default function ImagesEditor({ images, onChange }: { images: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const mounted = useRef(true)
  const nextId = useRef(1)
  const previews = useRef(new Set<string>())
  // Latest props, so a batch that finishes later appends to the current list rather than the one it started with.
  const latest = useRef({ images, onChange })
  useEffect(() => {
    latest.current = { images, onChange }
  })

  useEffect(() => {
    mounted.current = true
    const urls = previews.current
    return () => {
      mounted.current = false
      urls.forEach((u) => URL.revokeObjectURL(u))
      urls.clear()
    }
  }, [])

  function revoke(url: string | null) {
    if (!url) return
    URL.revokeObjectURL(url)
    previews.current.delete(url)
  }

  async function startBatch(list: File[]) {
    if (busy || list.length === 0) return
    setErr(null)
    setBusy(true)
    const batch: Row[] = list.map((f) => {
      const preview = f.type.startsWith('image/') ? URL.createObjectURL(f) : null
      if (preview) previews.current.add(preview)
      return { id: nextId.current++, name: f.name, preview, status: 'queued' }
    })
    const ids = batch.map((r) => r.id)
    // Earlier error rows stay until dismissed; the new batch goes underneath them.
    setRows((prev) => [...prev, ...batch])

    const { urls } = await uploadAll(list, uploadFile, {
      concurrency: 3,
      onStatus: (index, status, detail) => {
        if (!mounted.current) return
        const id = ids[index]
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status, detail } : r)))
      },
    })

    if (!mounted.current) return
    if (urls.length > 0) latest.current.onChange([...latest.current.images, ...urls])
    setRows((prev) =>
      prev.filter((r) => {
        if (ids.includes(r.id) && r.status === 'done') {
          revoke(r.preview)
          return false
        }
        return true
      }),
    )
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function dismiss(id: number) {
    setRows((prev) =>
      prev.filter((r) => {
        if (r.id !== id) return true
        revoke(r.preview)
        return false
      }),
    )
  }

  function add() {
    const v = draft.trim()
    if (!v) return
    if (!isProductImageUrl(v)) return setErr('Only http:// or https:// image URLs (or uploaded images) are allowed.')
    setErr(null)
    onChange([...images, v])
    setDraft('')
  }

  function setCover(i: number) {
    if (i === 0) return
    onChange([images[i], ...images.slice(0, i), ...images.slice(i + 1)])
    setEditing(null)
  }

  function remove(i: number) {
    onChange(images.filter((_, j) => j !== i))
    setEditing(null)
  }

  function onDragEnter(e: DragEvent<HTMLDivElement>) {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth.current += 1
    if (!busy) setOver(true)
  }
  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (!hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = busy ? 'none' : 'copy'
  }
  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    if (!hasFiles(e)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setOver(false)
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth.current = 0
    setOver(false)
    if (busy) return
    void startBatch(Array.from(e.dataTransfer.files))
  }

  const uploadingCount = rows.filter((r) => r.status === 'queued' || r.status === 'uploading').length

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        aria-busy={busy}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          over ? 'border-indigo-600 bg-indigo-50' : 'border-neutral-300 bg-neutral-50'
        } ${busy ? 'opacity-70' : ''}`}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-white text-indigo-600 ring-1 ring-neutral-200">
          {busy ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <ImagePlus size={20} aria-hidden />}
        </span>
        <p className="text-sm text-neutral-700">
          {busy ? (
            `Uploading ${uploadingCount} file${uploadingCount === 1 ? '' : 's'}...`
          ) : (
            <>
              Drag images here or{' '}
              <button
                type="button"
                className={`${btnGhost} ${btnSm} align-middle`}
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                Choose files
              </button>
            </>
          )}
        </p>
        <p className="text-xs text-neutral-500">JPG, PNG, WEBP or GIF, up to 5 MB each. The first image is the product cover.</p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          tabIndex={-1}
          aria-label="Choose image files"
          disabled={busy}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length) void startBatch(files)
          }}
        />
      </div>

      {/* Paste URL */}
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
          <Plus size={14} aria-hidden /> Add
        </button>
      </div>
      {err ? (
        <p role="alert" className="text-sm text-red-700">
          {err}
        </p>
      ) : null}

      {/* Batch status */}
      {rows.length > 0 ? (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white" aria-label="Upload status" aria-live="polite">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2">
              {r.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.preview} alt="" className="size-10 shrink-0 rounded-lg bg-white object-contain ring-1 ring-neutral-200" />
              ) : (
                <div className="size-10 shrink-0 rounded-lg bg-neutral-100 ring-1 ring-neutral-200" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-neutral-900" title={r.name}>
                  {r.name}
                </div>
                <div className={`text-xs ${r.status === 'error' ? 'text-red-700' : 'text-neutral-500'}`}>
                  {r.status === 'queued'
                    ? 'Queued'
                    : r.status === 'uploading'
                      ? 'Uploading...'
                      : r.status === 'done'
                        ? 'Done'
                        : (r.detail ?? 'Upload failed')}
                </div>
              </div>
              {r.status === 'uploading' ? <Loader2 size={16} className="shrink-0 animate-spin text-indigo-600" aria-hidden /> : null}
              {r.status === 'error' ? (
                <button type="button" className={`${btnGhost} ${btnSm} shrink-0`} onClick={() => dismiss(r.id)} aria-label={`Dismiss error for ${r.name}`}>
                  Dismiss
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Image grid */}
      {images.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-600">No images yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Product images">
          {images.map((src, i) => {
            const n = i + 1
            const valid = isProductImageUrl(src)
            return (
              <li key={`${src}-${i}`} className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs">
                <div className="relative aspect-square border-b border-neutral-200 bg-white">
                  {valid ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={`Image ${n}`} className="size-full object-contain p-2" />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-red-100 p-2 text-center text-xs font-medium text-red-800">
                      Invalid image URL
                    </div>
                  )}
                  <div className="absolute left-2 top-2 flex gap-1">
                    <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-neutral-700 ring-1 ring-inset ring-neutral-200">#{n}</span>
                    {i === 0 ? <Badge tone="accent">Cover</Badge> : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between px-1 py-1">
                  <div className="flex items-center">
                    <button type="button" className={tileBtn} disabled={i === 0} onClick={() => { onChange(move(images, i, -1)); setEditing(null) }} aria-label={`Move image ${n} left`} title="Move left">
                      <ChevronLeft size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={tileBtn}
                      disabled={i === images.length - 1}
                      onClick={() => { onChange(move(images, i, 1)); setEditing(null) }}
                      aria-label={`Move image ${n} right`}
                      title="Move right"
                    >
                      <ChevronRight size={16} aria-hidden />
                    </button>
                  </div>
                  <div className="flex items-center">
                    <button type="button" className={tileBtn} disabled={i === 0} onClick={() => setCover(i)} aria-label={`Set image ${n} as cover`} title="Set as cover">
                      <Star size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={`${tileBtn} ${editing === i ? 'bg-indigo-50 text-indigo-700' : ''}`}
                      onClick={() => setEditing(editing === i ? null : i)}
                      aria-label={`Edit URL of image ${n}`}
                      aria-expanded={editing === i}
                      title="Edit URL"
                    >
                      <Link2 size={16} aria-hidden />
                    </button>
                    <button type="button" className={`${tileBtn} hover:!bg-red-50 hover:!text-red-700`} onClick={() => remove(i)} aria-label={`Remove image ${n}`} title="Remove">
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                </div>
                {editing === i ? (
                  <div className="flex items-center gap-1 border-t border-neutral-200 p-1.5">
                    <input
                      aria-label={`Image ${n} URL`}
                      className={`${input} !px-2 !py-1 font-mono text-xs`}
                      value={src}
                      autoFocus
                      onChange={(e) => onChange(images.map((s, j) => (j === i ? e.target.value : s)))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') {
                          e.preventDefault()
                          setEditing(null)
                        }
                      }}
                    />
                    <button type="button" className={tileBtn} onClick={() => setEditing(null)} aria-label="Close URL editor">
                      <X size={14} aria-hidden />
                    </button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
