'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import type { CategoryNode } from '@/lib/catalog'
import type { Locale } from '@/i18n/routing'
import { t as l10n } from '@/lib/localized'
import { path } from '@/lib/paths'

const GAP = 4 // gap-x-1
const itemCls =
  'flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-900'
const saleCls = 'whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50'
const blogCls = 'whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-900'
const panelCls = 'rounded-xl border border-neutral-100 bg-white p-2 shadow-lg'
const subLinkCls = 'block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900'

/**
 * Desktop category row, always one line: categories that don't fit go into a "More" menu; Sale and Blog stay.
 * Widths come from an invisible copy of every item, re-measured on resize, font load and locale change.
 */
export default function CategoryBar({ locale, categories }: { locale: Locale; categories: CategoryNode[] }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const rowRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState<number | null>(null) // null = not measured yet
  const [moreOpen, setMoreOpen] = useState(false)

  const measure = useCallback(() => {
    const row = rowRef.current
    const m = measureRef.current
    if (!row || !m) return
    const width = (el: Element | null) => (el ? el.getBoundingClientRect().width : 0)
    const cats = Array.from(m.querySelectorAll('[data-cat]')).map(width)
    const more = width(m.querySelector('[data-more]')) + GAP
    // `row` is only the categories part (flex-1); Sale/Blog sit outside it, so its width never depends on its content.
    const avail = row.clientWidth
    const all = cats.reduce((s, w) => s + w + GAP, 0)
    if (all <= avail) return setVisible(cats.length)
    let used = more
    let n = 0
    while (n < cats.length && used + cats[n] + GAP <= avail) used += cats[n++] + GAP
    setVisible(n)
  }, [])

  useLayoutEffect(() => {
    measure()
  }, [measure, categories, locale])

  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(row)
    document.fonts?.ready.then(() => measure()).catch(() => {})
    return () => ro.disconnect()
  }, [measure])

  useEffect(() => setMoreOpen(false), [pathname])
  useEffect(() => {
    if (!moreOpen) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [moreOpen])

  const shownCount = visible ?? categories.length
  const shown = categories.slice(0, shownCount)
  const hidden = categories.slice(shownCount)

  const label = (c: CategoryNode) => (
    <>
      {l10n(c.name, locale)}
      {c.children.length > 0 && <ChevronDown size={13} className="text-neutral-400" aria-hidden />}
    </>
  )

  return (
    <div className="relative">
      {/* Invisible copy of every item, used only to measure widths (clipped so it never widens the page). */}
      <div aria-hidden className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
      <div ref={measureRef} className="flex w-max gap-x-1 whitespace-nowrap">
        {categories.map((c) => (
          <span key={c.id} data-cat className={itemCls}>
            {label(c)}
          </span>
        ))}
        <span data-more className={itemCls}>
          {t('more')}
          <ChevronDown size={13} aria-hidden />
        </span>
      </div>
      </div>

      <div data-category-bar className="flex flex-nowrap items-center gap-x-1">
      {/* Before the first measurement (server render, no JS yet) overflowing categories are clipped; Sale/Blog never are. */}
      <div ref={rowRef} className={`flex min-w-0 flex-1 flex-nowrap items-center gap-x-1 ${visible === null ? 'overflow-hidden' : ''}`}>
        {shown.map((c) => (
          <div key={c.id} className="group relative shrink-0">
            <Link href={path(locale, `/c/${c.slug}`)} className={itemCls}>
              {label(c)}
            </Link>
            {c.children.length > 0 && (
              <div className="invisible absolute left-0 top-full z-50 min-w-56 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <ul className={panelCls}>
                  {c.children.map((ch) => (
                    <li key={ch.id}>
                      <Link href={path(locale, `/c/${ch.slug}`)} className={subLinkCls}>
                        {l10n(ch.name, locale)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}

        {hidden.length > 0 && (
          <div
            ref={moreRef}
            className="group relative shrink-0"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setMoreOpen(false)
            }}
          >
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-haspopup="true"
              onClick={() => setMoreOpen((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setMoreOpen(false)
              }}
              className={itemCls}
            >
              {t('more')}
              <ChevronDown size={13} className={`text-neutral-400 transition ${moreOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            <div
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setMoreOpen(false)
                  moreRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
                }
              }}
              className={`absolute right-0 top-full z-50 min-w-60 pt-2 transition group-hover:visible group-hover:opacity-100 ${
                moreOpen ? 'visible opacity-100' : 'invisible opacity-0'
              }`}
            >
              <ul className={`${panelCls} max-h-[70vh] overflow-y-auto`}>
                {hidden.map((c) => (
                  <li key={c.id}>
                    <Link href={path(locale, `/c/${c.slug}`)} className={`${subLinkCls} font-semibold text-neutral-900`}>
                      {l10n(c.name, locale)}
                    </Link>
                    {c.children.map((ch) => (
                      <Link key={ch.id} href={path(locale, `/c/${ch.slug}`)} className={`${subLinkCls} pl-6`}>
                        {l10n(ch.name, locale)}
                      </Link>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

        <Link href={path(locale, '/sale')} className={`${saleCls} shrink-0`}>
          {t('sale')}
        </Link>
        <Link href={path(locale, '/blog')} className={`${blogCls} shrink-0`}>
          {t('blog')}
        </Link>
      </div>
    </div>
  )
}
