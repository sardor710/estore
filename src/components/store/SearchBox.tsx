'use client'

import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowRight, LayoutGrid, Loader2, Search } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { path } from '@/lib/paths'
import { formatUzs } from '@/lib/money'
import { tokenize } from '@/lib/search/text'
import { tokenMatch } from '@/lib/search/rank'
import type { Suggestions } from '@/lib/search/service'

const DEBOUNCE_MS = 200
const SPINNER_AFTER_MS = 300
const EMPTY: Suggestions = { products: [], categories: [] }

type Option = { key: string; href: string }

/** Bold the words of `text` that match a query word (same folding as the search engine, so typos highlight too). */
function Highlight({ text, q }: { text: string; q: string }) {
  const qTokens = tokenize(q)
  if (!qTokens.length) return <>{text}</>
  return (
    <>
      {text.split(/(\s+)/).map((part, i) => {
        const hit = tokenize(part).some((t) => qTokens.some((qt) => tokenMatch(qt, t) > 0))
        return hit ? (
          <strong key={i} className="font-bold text-neutral-900">
            {part}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      })}
    </>
  )
}

/**
 * Store search field with live suggestions (ARIA combobox). Typing ≥2 characters shows matching categories and
 * products under the field; ↑/↓ choose, Enter opens the choice (or the full results page), Esc closes / clears.
 */
export default function SearchBox({
  locale,
  id,
  autoFocus = false,
  onNavigate,
  className = '',
  align = 'right',
}: {
  locale: Locale
  id: string
  autoFocus?: boolean
  onNavigate?: () => void
  className?: string
  /** Which edge of the field the (wider) suggestion panel lines up with. */
  align?: 'left' | 'right'
}) {
  const t = useTranslations('nav')
  const ts = useTranslations('search.suggest')
  const router = useRouter()
  const pathname = usePathname()
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState('')
  const [data, setData] = useState<{ q: string; result: Suggestions } | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [spinner, setSpinner] = useState(false)

  const query = q.trim()
  const ready = query.length >= 2

  // Fetch suggestions (debounced). Each run aborts the previous request, so a slow stale answer never wins.
  useEffect(() => {
    if (!ready) return
    const ctrl = new AbortController()
    const spin = setTimeout(() => setSpinner(true), SPINNER_AFTER_MS)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(query)}&locale=${locale}`, { signal: ctrl.signal })
        const result: Suggestions = res.ok ? await res.json() : EMPTY
        if (!ctrl.signal.aborted) {
          setData({ q: query, result })
          setActive(-1)
        }
      } catch {
        if (!ctrl.signal.aborted) setData({ q: query, result: EMPTY })
      } finally {
        clearTimeout(spin)
        if (!ctrl.signal.aborted) setSpinner(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      ctrl.abort()
      clearTimeout(timer)
      clearTimeout(spin)
    }
  }, [query, ready, locale])

  // Close on navigation and on clicks outside.
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  const shown = ready && data ? data : null
  const result = shown?.result ?? EMPTY
  const searchHref = `${path(locale, '/search')}${query ? `?q=${encodeURIComponent(query)}` : ''}`
  const options: Option[] = [
    ...result.categories.map((c) => ({ key: `c-${c.slug}`, href: path(locale, `/c/${c.slug}`) })),
    ...result.products.map((p) => ({ key: `p-${p.slug}`, href: path(locale, `/p/${p.slug}`) })),
    ...(shown ? [{ key: 'all', href: searchHref }] : []),
  ]
  const expanded = open && ready && (shown !== null || spinner)
  const optId = (i: number) => `${listId}-opt-${i}`

  const go = (href: string) => {
    setOpen(false)
    onNavigate?.()
    router.push(href)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && options.length) {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % options.length)
    } else if (e.key === 'ArrowUp' && options.length) {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(expanded && active >= 0 && options[active] ? options[active].href : searchHref)
    } else if (e.key === 'Escape') {
      if (expanded) {
        e.preventDefault()
        setOpen(false)
        setActive(-1)
      } else if (q) {
        e.preventDefault()
        setQ('')
      }
    }
  }

  const row = (i: number) =>
    `flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${i === active ? 'bg-neutral-100' : 'hover:bg-neutral-50'}`
  let n = 0

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <form
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className="flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 transition focus-within:border-neutral-400 focus-within:bg-white"
      >
        <Search size={16} className="shrink-0 text-neutral-400" aria-hidden />
        <label htmlFor={id} className="sr-only">
          {t('search')}
        </label>
        <input
          id={id}
          type="search"
          enterKeyHint="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? optId(active) : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          value={q}
          maxLength={100}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('searchPlaceholder')}
          className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400 [&::-webkit-search-cancel-button]:hidden"
        />
        {spinner && ready && <Loader2 size={15} className="shrink-0 animate-spin text-neutral-400" aria-hidden />}
      </form>

      <div
        id={listId}
        role="listbox"
        aria-label={t('search')}
        hidden={!expanded}
        className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-full z-50 mt-2 max-h-[min(70vh,32rem)] w-full min-w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-neutral-100 bg-white p-2 shadow-xl`}
      >
        {!shown ? (
          <p className="px-3 py-4 text-sm text-neutral-500" role="status">
            {ts('loading')}
          </p>
        ) : (
          <>
            {result.categories.length > 0 && (
              <div role="group" aria-label={ts('categories')} className="pb-1">
                <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-neutral-400" aria-hidden>
                  {ts('categories')}
                </p>
                {result.categories.map((c) => {
                  const i = n++
                  return (
                    <div
                      key={c.slug}
                      id={optId(i)}
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(options[i].href)}
                      className={row(i)}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
                        <LayoutGrid size={16} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-neutral-700">
                        <Highlight text={c.name} q={shown.q} />
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            {result.products.length > 0 && (
              <div role="group" aria-label={ts('products')}>
                <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-neutral-400" aria-hidden>
                  {ts('products')}
                </p>
                {result.products.map((p) => {
                  const i = n++
                  return (
                    <div
                      key={p.slug}
                      id={optId(i)}
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(options[i].href)}
                      className={row(i)}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-50">
                        {p.image ? <img src={p.image} alt="" loading="lazy" className="h-full w-full object-contain" /> : <Search size={14} className="text-neutral-300" aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-neutral-700">
                          <Highlight text={p.title} q={shown.q} />
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs">
                          <span className="font-semibold text-neutral-900">{formatUzs(p.priceUzs, locale)}</span>
                          {p.compareAtUzs != null && p.compareAtUzs > p.priceUzs && (
                            <span className="text-neutral-400 line-through">{formatUzs(p.compareAtUzs, locale)}</span>
                          )}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            {result.categories.length === 0 && result.products.length === 0 && (
              <p className="px-3 pb-2 pt-3 text-sm text-neutral-500">{ts('none', { q: shown.q })}</p>
            )}
            {(() => {
              const i = n++
              return (
                <div
                  id={optId(i)}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(searchHref)}
                  className={`${row(i)} mt-1 border-t border-neutral-100 font-semibold text-neutral-900`}
                >
                  <span className="min-w-0 flex-1 truncate">{ts('seeAll', { q: shown.q })}</span>
                  <ArrowRight size={15} aria-hidden className="text-neutral-400" />
                </div>
              )
            })()}
          </>
        )}
      </div>
    </div>
  )
}
