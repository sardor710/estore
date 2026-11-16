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

type Props = {
  locale: Locale
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
export default function ProductHero({ locale, template, title, subtitle, shortSpec, badge, categoryName, images, variants, children }: Props) {
  const t = useTranslations('product')
  const { add } = useCart()
  const [variantIdx, setVariantIdx] = useState(() => Math.max(0, variants.findIndex((v) => v.stock > 0)))
  const [imageIdx, setImageIdx] = useState(0)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  const variant = variants[variantIdx]
  const name = l10n(title, locale)
  const hasSwatches = variants.some((v) => v.colorHex)
  const inStock = Boolean(variant && variant.stock > 0)
  const maxQty = variant ? Math.max(1, Math.min(variant.stock, 99)) : 1
  const discounted = variant?.compareAtUzs != null && variant.compareAtUzs > variant.priceUzs
  const current = images[imageIdx] ?? images[0]

  const pick = (i: number) => {
    setVariantIdx(i)
    setQty(1)
    const idx = variants[i]?.imageIndex
    if (idx != null && images[idx]) setImageIdx(idx)
  }

  const addToCart = () => {
    if (!variant || !inStock) return
    add(String(variant.id), qty)
    setAdded(true)
    setTimeout(() => setAdded(false), 1800)
  }

  const sticky = template === 'DETAILED'

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-14">
      {/* Gallery */}
      <div className="flex flex-col-reverse gap-4 md:flex-row lg:col-span-7">
        {images.length > 1 && (
          <div className="flex shrink-0 gap-3 overflow-x-auto pb-2 md:max-h-[580px] md:flex-col md:overflow-y-auto md:pb-0">
            {images.map((img, idx) => (
              <button
                key={img + idx}
                type="button"
                onClick={() => setImageIdx(idx)}
                aria-label={t('showImage', { n: idx + 1 })}
                aria-current={imageIdx === idx}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-100 p-1.5 transition-all sm:h-20 sm:w-20 ${
                  imageIdx === idx ? 'ring-2 ring-black ring-offset-2' : 'opacity-60 hover:opacity-100'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" className="h-full w-full object-contain" loading="lazy" />
              </button>
            ))}
          </div>
        )}
        <div className="group relative flex aspect-square flex-1 items-center justify-center overflow-hidden rounded-2xl bg-[#f5f5f7] p-6 sm:p-10">
          {badge && (
            <span className="absolute left-4 top-4 z-10 rounded bg-black px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              {badge}
            </span>
          )}
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current}
              alt={name}
              className="h-full w-full object-contain object-center transition-transform duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <span className="text-sm text-neutral-400">{t('noImage')}</span>
          )}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setImageIdx((imageIdx - 1 + images.length) % images.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-neutral-800 shadow-sm transition hover:bg-white md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                aria-label={t('prevImage')}
              >
                <ArrowLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setImageIdx((imageIdx + 1) % images.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-neutral-800 shadow-sm transition hover:bg-white md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                aria-label={t('nextImage')}
              >
                <ChevronRight size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Buy box */}
      <div className="lg:col-span-5">
        <div className={sticky ? 'lg:sticky lg:top-24' : ''}>
          <div className="space-y-5">
            <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">{categoryName}</span>
            <div>
              <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-neutral-900 sm:text-3xl lg:text-4xl">{name}</h1>
              {(l10n(subtitle, locale) || l10n(shortSpec, locale)) && (
                <p className="mt-2 text-sm font-medium text-neutral-600">{l10n(subtitle, locale) || l10n(shortSpec, locale)}</p>
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
