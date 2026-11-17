'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, Monitor, Smartphone, Trash2, X } from 'lucide-react'
import { locales, type Locale } from '@/i18n/routing'
import { t as pick } from '@/lib/localized'
import type { BannerInput } from '@/lib/admin/banners'
import { bannerHref, isValidBannerLink } from '@/lib/banner-link'
import { isProductImageUrl } from '@/lib/admin/products-shared'
import { uploadAll } from '@/lib/admin/upload-queue'
import { deleteBannerAction, saveBannerAction } from '@/app/admin/actions/banners'
import HeroSlide from '@/components/store/HeroSlide'
import L10nField from './L10nField'
import { btn, btnDanger, btnGhost, btnSm, card, input, Label, Notice } from './ui'

// Admin dates are Asia/Tashkent wall-clock time (UTC+5, no DST), like promotions and blog posts.
const TZ = '+05:00'
export function isoToTashkent(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(new Date(iso).getTime() + 5 * 3600_000)
  return d.toISOString().slice(0, 16)
}
export function tashkentToIso(local: string): string | null {
  if (!local) return null
  const d = new Date(`${local}:00${TZ}`)
  return Number.isNaN(d.getTime()) ? local : d.toISOString()
}

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('upload', file)
  const res = await fetch('/api/admin/uploads', { method: 'POST', body: fd })
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } }
  if (!res.ok || !body.url) throw new Error(body.error?.message ?? 'Upload failed')
  return body.url
}

function ImageField({ label, hint, value, onChange, error, optional }: { label: string; hint: string; value: string; onChange: (v: string) => void; error?: string; optional?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function onFile(f: File) {
    setErr(null)
    setBusy(true)
    const r = await uploadAll([f], uploadFile)
    setBusy(false)
    if (ref.current) ref.current.value = ''
    if (r.urls[0]) onChange(r.urls[0])
    else setErr(r.errors[0]?.message ?? 'Upload failed')
  }
  const shown = value && isProductImageUrl(value) ? value : null
  const message = err ?? error
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className="group relative flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-neutral-500 transition hover:border-indigo-500 hover:text-indigo-600"
          aria-label={shown ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : busy ? (
            <Loader2 className="animate-spin" size={20} aria-hidden />
          ) : (
            <span className="flex flex-col items-center gap-1 text-xs font-semibold">
              <ImagePlus size={20} aria-hidden /> Upload
            </span>
          )}
          {shown && busy ? (
            <span className="absolute inset-0 flex items-center justify-center bg-white/70">
              <Loader2 className="animate-spin" size={20} aria-hidden />
            </span>
          ) : null}
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <input className={`${input} font-mono text-xs`} placeholder="/uploads/... or https://..." aria-label={`${label} URL`} value={value} onChange={(e) => onChange(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className={`${btnGhost} ${btnSm}`} onClick={() => ref.current?.click()} disabled={busy}>
              {busy ? 'Uploading…' : shown ? 'Replace' : 'Upload'}
            </button>
            {optional && value ? (
              <button type="button" className={`${btnGhost} ${btnSm}`} onClick={() => onChange('')}>
                <X size={12} aria-hidden /> Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" aria-hidden tabIndex={-1} onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
      {message ? <p role="alert" className="mt-1 text-sm text-red-700">{message}</p> : null}
    </div>
  )
}

type Form = Omit<BannerInput, 'startsAt' | 'endsAt'> & { startsLocal: string; endsLocal: string }

export default function BannerEditor({ initial }: { initial: BannerInput | null }) {
  const router = useRouter()
  const [data, setData] = useState<Form>(() => ({
    id: initial?.id,
    title: initial?.title ?? {},
    text: initial?.text ?? {},
    buttonText: initial?.buttonText ?? {},
    imageUrl: initial?.imageUrl ?? '',
    mobileImageUrl: initial?.mobileImageUrl ?? '',
    linkUrl: initial?.linkUrl ?? '',
    active: initial?.active ?? true,
    startsLocal: isoToTashkent(initial?.startsAt ?? null),
    endsLocal: isoToTashkent(initial?.endsAt ?? null),
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [pending, start] = useTransition()
  const [previewLocale, setPreviewLocale] = useState<Locale>('uz')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const patch = (p: Partial<Form>) => {
    setData((d) => ({ ...d, ...p }))
    setDirty(true)
  }

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function save(e: React.FormEvent) {
    e.preventDefault()
    const { startsLocal, endsLocal, ...rest } = data
    start(async () => {
      const r = await saveBannerAction({ ...rest, startsAt: tashkentToIso(startsLocal), endsAt: tashkentToIso(endsLocal) })
      if (!r.ok) return setErrors(r.errors)
      setErrors({})
      setDirty(false)
      router.push('/admin/banners')
      router.refresh()
    })
  }

  function remove() {
    if (data.id === undefined || !window.confirm('Delete this banner? This cannot be undone.')) return
    start(async () => {
      const r = await deleteBannerAction(data.id!)
      if (!r.ok) return setErrors({ form: r.error })
      setDirty(false)
      router.push('/admin/banners')
      router.refresh()
    })
  }

  const linkOk = isValidBannerLink(data.linkUrl.trim())
  const previewImage = device === 'mobile' && data.mobileImageUrl && isProductImageUrl(data.mobileImageUrl) ? data.mobileImageUrl : data.imageUrl
  const preview = {
    id: 0,
    title: pick(data.title, previewLocale),
    text: pick(data.text, previewLocale),
    buttonText: pick(data.buttonText, previewLocale),
    imageUrl: isProductImageUrl(previewImage) ? previewImage : '',
    mobileImageUrl: null,
    href: linkOk ? bannerHref(previewLocale, data.linkUrl.trim()) : null,
  }

  return (
    <form onSubmit={save} className="space-y-5 pb-24">
      {errors.form ? <Notice kind="error">{errors.form}</Notice> : null}

      <section className={card} aria-labelledby="bn-preview">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="bn-preview" className="text-base font-semibold text-neutral-900">
            Live preview
          </h2>
          <div className="flex flex-wrap gap-2">
            <div role="group" aria-label="Preview language" className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
              {locales.map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={previewLocale === l}
                  onClick={() => setPreviewLocale(l)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold uppercase ${previewLocale === l ? 'bg-white text-indigo-700 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Preview device" className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
              {(
                [
                  ['desktop', Monitor],
                  ['mobile', Smartphone],
                ] as const
              ).map(([d, Icon]) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={device === d}
                  aria-label={d === 'desktop' ? 'Desktop' : 'Mobile'}
                  onClick={() => setDevice(d)}
                  className={`rounded-md px-2.5 py-1 ${device === d ? 'bg-white text-indigo-700 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'}`}
                >
                  <Icon size={14} aria-hidden />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={`mx-auto overflow-hidden rounded-lg bg-neutral-950 ${device === 'mobile' ? 'max-w-[360px]' : ''}`}>
          <div className={`relative w-full ${!preview.imageUrl ? 'h-32' : device === 'mobile' ? 'h-[460px]' : 'h-[300px] sm:h-[380px]'}`}>
            {preview.imageUrl ? (
              <HeroSlide banner={preview} preview />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-300">Add an image below to see the preview</div>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Scaled-down preview of the homepage slider. Missing text in a language falls back to Uzbek, then the others.</p>
      </section>

      <section className={`${card} space-y-4`} aria-labelledby="bn-images">
        <h2 id="bn-images" className="text-base font-semibold text-neutral-900">
          Images
        </h2>
        <ImageField label="Image" hint="required · about 1920×720, JPG/PNG/WEBP up to 5 MB" value={data.imageUrl} onChange={(imageUrl) => patch({ imageUrl })} error={errors.imageUrl} />
        <ImageField
          label="Mobile image"
          hint="optional · about 800×1000; phones use it instead"
          value={data.mobileImageUrl}
          onChange={(mobileImageUrl) => patch({ mobileImageUrl })}
          error={errors.mobileImageUrl}
          optional
        />
      </section>

      <section className={`${card} space-y-4`} aria-labelledby="bn-text">
        <h2 id="bn-text" className="text-base font-semibold text-neutral-900">
          Text and link
        </h2>
        <div>
          <L10nField label="Title" hint="up to 120 characters, optional" value={data.title} onChange={(title) => patch({ title })} />
          {errors.title ? <p role="alert" className="mt-1 text-sm text-red-700">{errors.title}</p> : null}
        </div>
        <div>
          <L10nField label="Text" hint="up to 300 characters, optional" multiline rows={3} value={data.text} onChange={(text) => patch({ text })} />
          {errors.text ? <p role="alert" className="mt-1 text-sm text-red-700">{errors.text}</p> : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <L10nField label="Button text" hint="up to 40 characters" value={data.buttonText} onChange={(buttonText) => patch({ buttonText })} />
            {errors.buttonText ? <p role="alert" className="mt-1 text-sm text-red-700">{errors.buttonText}</p> : null}
          </div>
          <label className="block">
            <Label hint="e.g. /c/chargers, /sale or https://...">Link URL</Label>
            <input
              className={`${input} font-mono text-xs`}
              value={data.linkUrl}
              aria-invalid={!linkOk || Boolean(errors.linkUrl)}
              onChange={(e) => patch({ linkUrl: e.target.value })}
              placeholder="/c/chargers"
            />
            {errors.linkUrl ? (
              <p role="alert" className="mt-1 text-sm text-red-700">
                {errors.linkUrl}
              </p>
            ) : !linkOk ? (
              <p className="mt-1 text-sm text-red-700">Use a site path starting with / (no spaces) or a full http(s):// URL.</p>
            ) : (
              <p className="mt-1 text-xs text-neutral-500">Site paths get the visitor&apos;s language added. No button text = the whole banner is clickable.</p>
            )}
          </label>
        </div>
      </section>

      <section className={`${card} space-y-4`} aria-labelledby="bn-when">
        <h2 id="bn-when" className="text-base font-semibold text-neutral-900">
          Visibility
        </h2>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="h-4 w-4" checked={data.active} onChange={(e) => patch({ active: e.target.checked })} />
          <span className="text-sm font-medium text-neutral-800">Show on the homepage</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <Label hint="Tashkent time, optional">Start</Label>
            <input className={input} type="datetime-local" value={data.startsLocal} onChange={(e) => patch({ startsLocal: e.target.value })} />
            {errors.startsAt ? <p role="alert" className="mt-1 text-sm text-red-700">{errors.startsAt}</p> : null}
          </label>
          <label>
            <Label hint="Tashkent time, optional">End</Label>
            <input className={input} type="datetime-local" value={data.endsLocal} onChange={(e) => patch({ endsLocal: e.target.value })} />
            {errors.endsAt ? <p role="alert" className="mt-1 text-sm text-red-700">{errors.endsAt}</p> : null}
          </label>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <span className="mr-auto text-sm text-neutral-600" role="status">
            {pending ? 'Saving…' : Object.keys(errors).length ? 'Fix the highlighted fields' : dirty ? 'Unsaved changes' : 'No changes'}
          </span>
          {data.id !== undefined ? (
            <button type="button" className={btnDanger} onClick={remove} disabled={pending}>
              <Trash2 size={14} aria-hidden /> Delete
            </button>
          ) : null}
          <button type="button" className={btnGhost} onClick={() => router.push('/admin/banners')} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className={btn} disabled={pending}>
            {pending ? 'Saving…' : data.id === undefined ? 'Create banner' : 'Save banner'}
          </button>
        </div>
      </div>
    </form>
  )
}
