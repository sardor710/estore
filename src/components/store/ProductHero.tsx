'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Check, ChevronRight, Minus, Plus, ShoppingBag, Truck, ShieldCheck } from 'lucide-react'
import type { VariantView } from '@/lib/catalog'
import type { L10n } from '@/lib/localized'
import type { Locale } from '@/i18n/routing'
import { t as l10n } from '@/lib/localized'
import { formatUzs } from '@/lib/money'
import { useCart } from '@/lib/cart/useCart'
import { flyToCart } from '@/lib/cart/flyToCart'
import { showCartToast } from '@/lib/cart/cartToast'
import { stepIndex, visibleIndex } from '@/lib/gallery'
import FavoriteButton from '@/components/account/FavoriteButton'

type Props = {
  locale: Locale
  /** Enables the favorites heart in the buy box (storefront only; hidden without the shell's provider). */
  productId?: number
  template: 'SIMPLE' | 'DETAILED'
  title: L10n
  subtitle: L10n
  shortSpec: L10n
  badge: string | null
  categoryName: string
  images: string[]
  variants: VariantView[]
  /** Rendered under the buy box in the right column (simple template accordions). */
  children?: ReactNode
}

function isLight(hex: string | null): boolean {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return false
  const n = parseInt(hex.slice(1), 16)
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return lum > 186
}

/** Gallery + variant selector + price/stock + add-to-cart. Shared by both templates. */
export default function ProductHero({ locale, productId, template, title, subtitle, shortSpec, badge, categoryName, images, variants, children }: Props) {
  const t = useTranslations('product')
  const { add } = useCart()
  const [variantIdx, setVariantIdx] = useState(() => Math.max(0, variants.findIndex((v) => v.stock > 0)))
  const [imageIdx, setImageIdx] = useState(0)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  // Images that failed to load (e.g. 404 upstream) are hidden; the main view falls back to the next one.
  const [broken, setBroken] = useState<ReadonlySet<number>>(() => new Set())
  const markBroken = (i: number) => setBroken((b) => (b.has(i) ? b : new Set(b).add(i)))
  // An image may already have failed before hydration attached onError.
  const checkLoaded = (i: number) => (el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth === 0) markBroken(i)
  }

  const variant = variants[variantIdx]
  const name = l10n(title, locale)
  const hasSwatches = variants.some((v) => v.colorHex)
  const inStock = Boolean(variant && variant.stock > 0)
  const maxQty = variant ? Math.max(1, Math.min(variant.stock, 99)) : 1
  const discounted = variant?.compareAtUzs != null && variant.compareAtUzs > variant.priceUzs
  const shownIdx = visibleIndex(images.length, broken, imageIdx)
  const current = shownIdx === null ? undefined : images[shownIdx]
  const working = images.length - broken.size
  // 1-based position among the images that load, for the phone counter.
  const position = shownIdx === null ? 0 : images.slice(0, shownIdx + 1).filter((_, i) => !broken.has(i)).length
  const step = (dir: 1 | -1) => shownIdx !== null && setImageIdx(stepIndex(images.length, broken, shownIdx, dir) ?? shownIdx)
  // Phones have no thumbnail strip: a horizontal swipe on the main image flips through the gallery.
  const [touchX, setTouchX] = useState<number | null>(null)
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX === null) return
    const dx = e.changedTouches[0].clientX - touchX
    setTouchX(null)
    if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1)
  }

  const pick = (i: number) => {
    setVariantIdx(i)
    setQty(1)
    const idx = variants[i]?.imageIndex
    if (idx != null && images[idx]) setImageIdx(idx)
  }

  const addToCart = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!variant || !inStock) return
    if (!add(variant.id, qty, variant.stock)) {
      showCartToast({ kind: 'max' })
      return
    }
    void flyToCart({ from: e.currentTarget, imageSrc: current })
    showCartToast({ kind: 'added' })
    setAdded(true)
    setTimeout(() => setAdded(false), 1800)
  }

  const sticky = template === 'DETAILED'

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-8 lg:grid-cols-12 lg:gap-14">
      {/* Gallery */}
      <div className="flex flex-col-reverse gap-4 md:flex-row lg:col-span-7">
        {working > 1 && (
          <div className="hidden shrink-0 gap-3 md:flex md:max-h-[580px] md:flex-col md:overflow-y-auto lg:max-h-[min(580px,calc(100svh-10rem))]">
            {images.map((img, idx) =>
              broken.has(idx) ? null : (
              <button
                key={img + idx}
                type="button"
                onClick={() => setImageIdx(idx)}
                aria-label={t('showImage', { n: idx + 1 })}
                aria-current={shownIdx === idx}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-100 p-1.5 transition-all sm:h-20 sm:w-20 ${
                  shownIdx === idx ? 'ring-2 ring-black ring-offset-2' : 'opacity-60 hover:opacity-100'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" className="h-full w-full object-contain" loading="lazy" ref={checkLoaded(idx)} onError={() => markBroken(idx)} />
              </button>
              ),
            )}
          </div>
        )}
        {/* Square on tablets; capped by the screen height elsewhere so the title and price stay in view (phones) and
            tall 4:5 imported infographics are not cropped by the fold (desktop). */}
        <div
          className="group relative flex aspect-square max-h-[46svh] w-full items-center justify-center overflow-hidden rounded-2xl bg-[#f5f5f7] p-2 sm:p-4 md:max-h-none md:flex-1 lg:max-h-[min(580px,calc(100svh-10rem))]"
          onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
          onTouchEnd={onTouchEnd}
        >
          {badge && (
            <span className="absolute left-4 top-4 z-10 rounded bg-black px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              {badge}
            </span>
          )}
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={shownIdx}
              src={current}
              alt={name}
              ref={shownIdx === null ? undefined : checkLoaded(shownIdx)}
              onError={() => shownIdx !== null && markBroken(shownIdx)}
              className="h-full w-full object-contain object-center transition-transform duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <span className="text-sm text-neutral-400">{t('noImage')}</span>
          )}
          {working > 1 && shownIdx !== null && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-neutral-800 shadow-sm transition hover:bg-white md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                aria-label={t('prevImage')}
              >
                <ArrowLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-neutral-800 shadow-sm transition hover:bg-white md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                aria-label={t('nextImage')}
              >
                <ChevronRight size={16} />
              </button>
              <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white md:hidden" aria-hidden>
                {position}/{working}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Buy box */}
      <div className="lg:col-span-5">
        <div className={sticky ? 'lg:sticky lg:top-24' : ''}>
          <div className="space-y-4 sm:space-y-5">
            <span className="hidden text-xs font-bold uppercase tracking-widest text-neutral-500 sm:inline">{categoryName}</span>
            <div>
              <h1 className="text-xl font-extrabold leading-tight tracking-tight text-neutral-900 sm:text-3xl lg:text-4xl">{name}</h1>
              {(l10n(subtitle, locale) || l10n(shortSpec, locale)) && (
                <p className="mt-1 text-sm font-medium text-neutral-600 sm:mt-2">{l10n(subtitle, locale) || l10n(shortSpec, locale)}</p>
              )}
            </div>

            {variant && (
              <div>
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="text-2xl font-extrabold text-neutral-950 sm:text-3xl">{formatUzs(variant.priceUzs, locale)}</span>
                  {discounted && (
                    <>
                      <span className="text-base text-neutral-400 line-through">{formatUzs(variant.compareAtUzs!, locale)}</span>
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                        {t('save', { amount: formatUzs(variant.compareAtUzs! - variant.priceUzs, locale) })}
                      </span>
                    </>
                  )}
                </div>
                <p className={`mt-2 flex items-center gap-1.5 text-sm font-medium ${inStock ? 'text-emerald-700' : 'text-neutral-500'}`}>
                  <span className={`inline-block h-2 w-2 rounded-full ${inStock ? 'bg-emerald-500' : 'bg-neutral-400'}`} aria-hidden />
                  {inStock ? (variant.stock <= 5 ? t('lowStock', { count: variant.stock }) : t('inStock')) : t('outOfStock')}
                </p>
              </div>
            )}

            {variants.length > 1 && (
              <fieldset className="border-t border-neutral-100 pt-4">
                <legend className="mb-2.5 text-xs font-bold uppercase tracking-wider text-neutral-700">
                  {t('option')}: <span className="font-semibold text-neutral-900">{l10n(variant?.name, locale)}</span>
                </legend>
                <div className="flex flex-wrap items-center gap-3">
                  {variants.map((v, i) => {
                    const selected = i === variantIdx
                    const vn = l10n(v.name, locale)
                    return hasSwatches && v.colorHex ? (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => pick(i)}
                        title={vn}
                        aria-label={vn}
                        aria-pressed={selected}
                        className={`relative flex h-9 w-9 items-center justify-center rounded-full border border-black/10 transition-transform ${
                          selected ? 'scale-105 ring-2 ring-black ring-offset-2' : 'opacity-85 hover:opacity-100'
                        } ${v.stock <= 0 ? 'opacity-40' : ''}`}
                        style={{ backgroundColor: v.colorHex }}
                      >
                        {selected && <Check size={14} className={isLight(v.colorHex) ? 'text-black' : 'text-white'} aria-hidden />}
                      </button>
                    ) : (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => pick(i)}
                        aria-pressed={selected}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                          selected ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700 hover:border-neutral-400'
                        } ${v.stock <= 0 ? 'opacity-50' : ''}`}
                      >
                        {vn}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            )}

            <div className="flex gap-3">
              <div className="flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-1.5" role="group" aria-label={t('quantity')}>
                <button
                  type="button"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  disabled={qty <= 1}
                  aria-label={t('decrease')}
                  className="rounded-full p-2.5 text-neutral-600 hover:text-black disabled:opacity-30"
                >
                  <Minus size={14} />
                </button>
                <span className="min-w-6 text-center text-sm font-bold tabular-nums text-neutral-900" aria-live="polite">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(Math.min(maxQty, qty + 1))}
                  disabled={qty >= maxQty || !inStock}
                  aria-label={t('increase')}
                  className="rounded-full p-2.5 text-neutral-600 hover:text-black disabled:opacity-30"
                >
                  <Plus size={14} />
                </button>
              </div>
              <button
                type="button"
                onClick={addToCart}
                disabled={!inStock}
                className={`flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg transition-all duration-200 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:shadow-none ${
                  added ? 'bg-emerald-600' : 'bg-neutral-900 hover:bg-black hover:shadow-xl'
                }`}
              >
                {!inStock ? (
                  t('outOfStock')
                ) : added ? (
                  <>
                    <Check size={16} aria-hidden /> {t('added')}
                  </>
                ) : (
                  <>
                    <ShoppingBag size={16} aria-hidden /> {t('addToCart')}
                    {variant && <span className="hidden sm:inline"> · {formatUzs(variant.priceUzs * qty, locale)}</span>}
                  </>
                )}
              </button>
              {productId != null && <FavoriteButton productId={productId} name={name} locale={locale} variant="hero" />}
            </div>

            <ul className="grid grid-cols-2 gap-2 border-y border-neutral-100 py-3 text-center text-[11px] text-neutral-600">
              <li className="flex flex-col items-center gap-1">
                <Truck size={16} className="text-neutral-700" aria-hidden />
                {t('delivery')}
              </li>
              <li className="flex flex-col items-center gap-1">
                <ShieldCheck size={16} className="text-neutral-700" aria-hidden />
                {t('original')}
              </li>
            </ul>
            {variant && (
              <p className="text-xs text-neutral-400">
                {t('sku')}: {variant.sku}
              </p>
            )}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
