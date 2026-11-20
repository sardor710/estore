'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { formatUzs } from '@/lib/money'
import { path } from '@/lib/paths'
import { useCart, useCartDrawer } from '@/lib/cart/useCart'
import { useQuote } from '@/lib/cart/useQuote'
import { useTgMainButton } from '@/components/tg/useTg'

export default function CartDrawer({ locale, telegram = false }: { locale: Locale; telegram?: boolean }) {
  const t = useTranslations('cart')
  const tTg = useTranslations('tg')
  const router = useRouter()
  const { open, setOpen } = useCartDrawer()
  const { lines, setQty, remove } = useCart()
  const { quote, loading, error, reload } = useQuote(lines, locale, open)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    // Return focus to whatever opened the drawer (cart icon, toast button) when it closes.
    const active = document.activeElement
    const opener = active instanceof HTMLElement && active !== document.body ? active : null
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
      // the toast's "View cart" button is gone by now: fall back to the cart icon
      const back = opener?.isConnected ? opener : document.querySelector<HTMLElement>('button[data-cart-target], [data-cart-target]')?.closest('button')
      back?.focus({ preventScroll: true })
    }
  }, [open, setOpen])

  // The server is the authority on stock; pull quantities down to what exists.
  useEffect(() => {
    if (!quote) return
    for (const it of quote.items) {
      if (it.available && it.stock > 0 && it.qty > it.stock) setQty(it.variantId, it.stock)
    }
  }, [quote, setQty])

  const byId = new Map((quote?.items ?? []).map((i) => [i.variantId, i]))
  const total = quote?.totalUzs ?? 0
  const min = quote?.minOrderUzs ?? 0
  const hasBad = (quote?.items ?? []).some((i) => !i.available || i.stock === 0)
  const belowMin = quote != null && total < min
  const canCheckout = quote != null && !loading && !error && lines.length > 0 && !belowMin && !hasBad && total > 0

  // Telegram Mini App: the big native button replaces the in-drawer Checkout link.
  const tgButton = useTgMainButton(telegram && open && canCheckout ? tTg('checkoutButton', { total: formatUzs(total, locale) }) : null, () => {
    setOpen(false)
    router.push(path(locale, '/checkout'))
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="text-lg font-extrabold text-neutral-900">{t('title')}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t('close')}
            className="rounded-full p-2 text-neutral-700 hover:bg-neutral-100"
          >
            <X size={20} />
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <ShoppingBag size={40} className="text-neutral-300" aria-hidden />
            <p className="text-neutral-600">{t('empty')}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white hover:bg-neutral-700"
            >
              {t('continueShopping')}
            </button>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-neutral-100 overflow-y-auto px-5">
              {lines.map((l) => {
                const it = byId.get(l.variantId)
                const unavailable = quote != null && (!it || !it.available)
                const outOfStock = it?.available && it.stock === 0
                const max = it?.available && it.stock > 0 ? it.stock : undefined
                return (
                  <li key={l.variantId} className="flex gap-3 py-4">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-neutral-50">
                      {it?.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.image} alt="" className="h-full w-full object-contain" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {unavailable ? (
                        <p className="text-sm font-semibold text-red-600">{t('unavailable')}</p>
                      ) : (
                        <>
                          <p className="line-clamp-2 text-sm font-semibold text-neutral-900">{it?.title ?? '...'}</p>
                          {it?.variantName && <p className="text-xs text-neutral-500">{it.variantName}</p>}
                          {outOfStock && <p className="text-xs font-semibold text-red-600">{t('outOfStock')}</p>}
                          {max != null && max <= 5 && <p className="text-xs text-amber-600">{t('onlyLeft', { count: max })}</p>}
                        </>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        {unavailable || outOfStock ? (
                          <span />
                        ) : (
                          <div className="flex items-center rounded-full border border-neutral-200" role="group" aria-label={t('qty')}>
                            <button
                              type="button"
                              onClick={() => setQty(l.variantId, l.qty - 1)}
                              aria-label={t('decrease')}
                              className="rounded-full p-1.5 hover:bg-neutral-100"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="min-w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                              {l.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => setQty(l.variantId, l.qty + 1)}
                              disabled={max != null && l.qty >= max}
                              aria-label={t('increase')}
                              className="rounded-full p-1.5 hover:bg-neutral-100 disabled:opacity-30"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          {it?.available && (
                            <span className="flex flex-col items-end leading-tight">
                              <span className="text-sm font-bold text-neutral-900">{formatUzs(it.priceUzs * l.qty, locale)}</span>
                              {it.originalUzs > it.priceUzs && (
                                <s className="text-xs text-neutral-400">{formatUzs(it.originalUzs * l.qty, locale)}</s>
                              )}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => remove(l.variantId)}
                            aria-label={t('remove', { name: it?.title || '' })}
                            className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="space-y-3 border-t border-neutral-100 px-5 py-4">
              {error && (
                <p className="flex items-center justify-between gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {t('quoteError')}
                  <button type="button" onClick={reload} className="font-semibold underline">
                    {t('retry')}
                  </button>
                </p>
              )}
              {belowMin && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
                  {t('addMore', { amount: formatUzs(min - total, locale) })}
                </p>
              )}
              {quote && !belowMin && !hasBad && total > 0 && (
                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{t('freeDelivery')}</p>
              )}
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-neutral-500">{t('total')}</span>
                <span className="text-xl font-extrabold text-neutral-900">{quote ? formatUzs(total, locale) : loading ? t('loading') : ''}</span>
              </div>
              {min > 0 && <p className="text-xs text-neutral-500">{t('minOrder', { amount: formatUzs(min, locale) })}</p>}
              {tgButton ? null : canCheckout ? (
                <Link
                  href={path(locale, '/checkout')}
                  onClick={() => setOpen(false)}
                  className="block rounded-full bg-neutral-900 px-6 py-3.5 text-center text-sm font-semibold text-white hover:bg-neutral-700"
                >
                  {t('checkout')}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="block w-full cursor-not-allowed rounded-full bg-neutral-200 px-6 py-3.5 text-center text-sm font-semibold text-neutral-500"
                >
                  {t('checkout')}
                </button>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
