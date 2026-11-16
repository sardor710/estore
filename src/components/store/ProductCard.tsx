'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Check, Plus } from 'lucide-react'
import type { CardProduct } from '@/lib/catalog'
import type { Locale } from '@/i18n/routing'
import { t as l10n } from '@/lib/localized'
import { formatUzs } from '@/lib/money'
import { path } from '@/lib/paths'
import { useCart } from '@/lib/cart/useCart'

export default function ProductCard({ product, locale }: { product: CardProduct; locale: Locale }) {
  const t = useTranslations('product')
  const { add } = useCart()
  const [justAdded, setJustAdded] = useState(false)
  const title = l10n(product.title, locale)
  const shortSpec = l10n(product.shortSpec, locale)
  const href = path(locale, `/p/${product.slug}`)

  const quickAdd = () => {
    if (!product.quickAddVariantId) return
    add(product.quickAddVariantId, 1)
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 1200)
  }

  const price = formatUzs(product.minPriceUzs, locale)

  return (
    <div className="group relative flex h-full flex-col rounded-xl border border-neutral-100/80 bg-white p-3 transition-all duration-300 hover:shadow-md sm:p-4">
      <Link href={href} className="block outline-offset-4">
        <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-[#f6f6f7] p-4 transition-colors group-hover:bg-[#f0f0f2]">
          {product.badge && (
            <span className="absolute left-3 top-3 z-10 rounded bg-black px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              {product.badge}
            </span>
          )}
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image}
              alt={title}
              loading="lazy"
              className={`h-full w-full object-contain object-center transition-all duration-500 ease-out group-hover:scale-105 ${
                product.inStock ? '' : 'opacity-50'
              }`}
            />
          ) : (
            <span className="text-xs text-neutral-400">{t('noImage')}</span>
          )}
          {!product.inStock && (
            <span className="absolute bottom-3 left-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-600 shadow-sm">
              {t('outOfStock')}
            </span>
          )}
        </div>
        <div className="pt-4">
          <h3 className="line-clamp-2 text-sm font-bold tracking-tight text-neutral-900 transition group-hover:text-neutral-600 sm:text-base">
            {title}
          </h3>
          {shortSpec && <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500">{shortSpec}</p>}
        </div>
      </Link>

      <div className="mt-3 flex items-end justify-between gap-2 border-t border-neutral-100 pt-3">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold text-neutral-950 sm:text-base">
            {product.hasMultiplePrices ? t('from', { price }) : price}
          </span>
          {product.compareAtUzs && (
            <span className="text-xs text-neutral-400 line-through">{formatUzs(product.compareAtUzs, locale)}</span>
          )}
        </div>
        <button
          type="button"
          onClick={quickAdd}
          disabled={!product.quickAddVariantId}
          aria-label={t('quickAdd', { name: title })}
          className={`shrink-0 rounded-full p-2.5 shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
            justAdded ? 'scale-110 bg-emerald-600 text-white' : 'bg-neutral-900 text-white hover:bg-black'
          }`}
        >
          {justAdded ? <Check size={16} /> : <Plus size={16} />}
        </button>
      </div>
    </div>
  )
}
