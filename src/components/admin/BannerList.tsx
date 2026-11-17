'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, GalleryHorizontal, Link2, Pencil, Smartphone } from 'lucide-react'
import type { BannerRow, BannerState } from '@/lib/admin/banners'
import { reorderBannersAction, toggleBannerAction } from '@/app/admin/actions/banners'
import { Badge, btn, btnGhost, btnSm, EmptyState, Notice } from './ui'

const STATE: Record<BannerState, { label: string; tone: 'green' | 'blue' | 'amber' | 'neutral' }> = {
  live: { label: 'Live', tone: 'green' },
  scheduled: { label: 'Scheduled', tone: 'blue' },
  expired: { label: 'Expired', tone: 'amber' },
  off: { label: 'Off', tone: 'neutral' },
}

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

function schedule(b: BannerRow): string {
  if (b.startsAt && b.endsAt) return `${fmt(b.startsAt)} – ${fmt(b.endsAt)}`
  if (b.startsAt) return `From ${fmt(b.startsAt)}`
  if (b.endsAt) return `Until ${fmt(b.endsAt)}`
  return 'Always'
}

const titleOf = (b: BannerRow) => b.title.en || b.title.uz || b.title.ru || ''

export default function BannerList({ banners }: { banners: BannerRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) setError(r.error)
      router.refresh()
    })
  }

  function moveBy(i: number, d: -1 | 1) {
    const ids = banners.map((b) => b.id)
    const j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    run(() => reorderBannersAction(ids))
  }

  if (banners.length === 0) {
    return (
      <EmptyState
        icon={GalleryHorizontal}
        title="No banners yet"
        text="The homepage shows the built-in slides until you add a banner."
        action={
          <Link href="/admin/banners/new" className={btn}>
            Add banner
          </Link>
        }
      />
    )
  }

  const live = banners.filter((b) => b.state === 'live').length
  return (
    <div className="space-y-3">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {live === 0 ? <Notice kind="warn">No banner is live right now, so the homepage shows the built-in slides.</Notice> : null}
      <ol className="space-y-3" aria-busy={pending}>
        {banners.map((b, i) => {
          const s = STATE[b.state]
          const title = titleOf(b)
          return (
            <li key={b.id} className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-xs sm:flex-row sm:items-center">
              <div className="flex items-center gap-3 sm:contents">
                <span className="w-6 shrink-0 text-center text-sm font-semibold text-neutral-400 sm:order-none">{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.imageUrl} alt="" loading="lazy" className="h-20 w-36 shrink-0 rounded-lg border border-neutral-200 bg-neutral-100 object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/banners/${b.id}`} className={`truncate font-semibold underline-offset-2 hover:underline ${title ? 'text-neutral-900' : 'italic text-neutral-500'}`}>
                    {title || 'Image-only banner'}
                  </Link>
                  <Badge tone={s.tone}>{s.label}</Badge>
                  {b.mobileImageUrl ? (
                    <span title="Has a mobile image" className="text-neutral-500">
                      <Smartphone size={14} aria-label="Has a mobile image" />
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-neutral-600">{schedule(b)}</div>
                {b.linkUrl ? (
                  <div className="mt-0.5 flex items-center gap-1 truncate font-mono text-xs text-neutral-500">
                    <Link2 size={12} aria-hidden /> {b.linkUrl}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="mr-1 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-neutral-700">
                  <input type="checkbox" className="h-4 w-4" checked={b.active} disabled={pending} onChange={(e) => run(() => toggleBannerAction(b.id, e.target.checked))} />
                  Shown
                </label>
                <button type="button" className={`${btnGhost} ${btnSm} !px-2`} onClick={() => moveBy(i, -1)} disabled={pending || i === 0} aria-label={`Move banner ${i + 1} up`}>
                  <ArrowUp size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  className={`${btnGhost} ${btnSm} !px-2`}
                  onClick={() => moveBy(i, 1)}
                  disabled={pending || i === banners.length - 1}
                  aria-label={`Move banner ${i + 1} down`}
                >
                  <ArrowDown size={14} aria-hidden />
                </button>
                <Link href={`/admin/banners/${b.id}`} className={`${btnGhost} ${btnSm}`}>
                  <Pencil size={12} aria-hidden /> Edit
                </Link>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
