'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Languages, Loader2, RotateCcw, Undo2 } from 'lucide-react'
import {
  imageTranslationsAction,
  keepOriginalImageAction,
  redoImageAction,
  translateAllImagesAction,
  type ImageTranslationsState,
} from '@/app/admin/actions/image-translations'
import type { ImageTranslationRow, ImageTranslationStatus } from '@/lib/image-translate/service'
import { Badge, btnGhost, btnSm, Notice } from './ui'

const LOCALES = ['uz', 'ru'] as const

const STATUS: Record<ImageTranslationStatus | 'NONE', { label: string; tone: 'neutral' | 'green' | 'amber' | 'red' | 'blue' }> = {
  NONE: { label: 'Not queued', tone: 'neutral' },
  PENDING: { label: 'Waiting', tone: 'blue' },
  RUNNING: { label: 'Translating…', tone: 'blue' },
  DONE: { label: 'Translated', tone: 'green' },
  NO_TEXT: { label: 'No text', tone: 'neutral' },
  FAILED: { label: 'Failed', tone: 'red' },
  ORIGINAL: { label: 'Original kept', tone: 'amber' },
}

/**
 * Review of the AI-translated copies of a product's images: original next to the uz and ru copies.
 * Translation runs on its own after saving; this panel only shows it and lets staff redo or reject a copy.
 */
export default function ImageTranslationsPanel({ productId, dirty }: { productId: number; dirty: boolean }) {
  const [state, setState] = useState<ImageTranslationsState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const load = useCallback(() => {
    imageTranslationsAction(productId)
      .then(setState)
      .catch(() => setError('Could not load image translations.'))
  }, [productId])

  useEffect(load, [load])

  const busy = state?.rows.some((r) => r.status === 'PENDING' || r.status === 'RUNNING') ?? false
  useEffect(() => {
    if (!busy) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [busy, load])

  const run = (fn: () => Promise<ImageTranslationsState>) =>
    start(async () => {
      setError(null)
      try {
        setState(await fn())
      } catch {
        setError('That did not work. Reload the page and try again.')
      }
    })

  if (!state) return <p className="text-sm text-neutral-500">Loading image translations…</p>
  if (!state.configured) {
    return <Notice kind="info">Image translation is off: set OPENROUTER_API_KEY on the server.</Notice>
  }

  const row = (url: string, l: string): ImageTranslationRow | undefined => state.rows.find((r) => r.sourceUrl === url && r.locale === l)
  const queued = state.urls.some((u) => LOCALES.some((l) => !row(u, l)))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-neutral-600">
          English text in the images is redrawn in Uzbek and Russian after you save. The uz and ru pages show the copy; English keeps the original.
        </p>
        {queued && (
          <button type="button" className={`${btnGhost} ${btnSm}`} disabled={pending || dirty} onClick={() => run(() => translateAllImagesAction(productId))}>
            <Languages className="size-3.5" aria-hidden /> Translate new images
          </button>
        )}
      </div>
      {dirty && <Notice kind="info">Save the product first: new images are translated after saving.</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {state.urls.length === 0 && <p className="text-sm text-neutral-500">No images yet.</p>}
      <ul className="space-y-3">
        {state.urls.map((url) => (
          <li key={url} className="grid grid-cols-3 gap-2 rounded-lg border border-neutral-200 p-2">
            <figure className="min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="aspect-square w-full rounded bg-neutral-50 object-contain" loading="lazy" />
              <figcaption className="mt-1 text-xs text-neutral-500">Original (en)</figcaption>
            </figure>
            {LOCALES.map((l) => {
              const r = row(url, l)
              const s = STATUS[r?.status ?? 'NONE']
              return (
                <figure key={l} className="min-w-0">
                  {r?.status === 'DONE' && r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.url} alt="" className="aspect-square w-full rounded bg-neutral-50 object-contain" loading="lazy" />
                    </a>
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center rounded bg-neutral-50 text-xs text-neutral-400">
                      {r?.status === 'RUNNING' || r?.status === 'PENDING' ? <Loader2 className="size-5 animate-spin" aria-hidden /> : 'Original shown'}
                    </div>
                  )}
                  <figcaption className="mt-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1 text-xs">
                      <span className="font-semibold uppercase">{l}</span>
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </div>
                    {r?.status === 'FAILED' && r.error && <p className="line-clamp-3 text-xs text-red-700">{r.error}</p>}
                    {r && r.status !== 'PENDING' && r.status !== 'RUNNING' && (
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className={`${btnGhost} ${btnSm}`}
                          disabled={pending}
                          title={r.status === 'NO_TEXT' ? 'Read the image text again and translate' : 'Draw this translation again'}
                          onClick={() => run(() => redoImageAction(productId, url, l, r.status === 'NO_TEXT' || r.status === 'FAILED'))}
                        >
                          <RotateCcw className="size-3" aria-hidden /> Redo
                        </button>
                        {r.status === 'DONE' && (
                          <button
                            type="button"
                            className={`${btnGhost} ${btnSm}`}
                            disabled={pending}
                            title="Show the original English image on this language"
                            onClick={() => run(() => keepOriginalImageAction(productId, url, l))}
                          >
                            <Undo2 className="size-3" aria-hidden /> Use original
                          </button>
                        )}
                      </div>
                    )}
                  </figcaption>
                </figure>
              )
            })}
          </li>
        ))}
      </ul>
    </div>
  )
}
