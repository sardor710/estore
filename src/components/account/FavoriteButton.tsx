'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Heart } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { useFavorites } from './FavoritesProvider'
import { loginHref } from './signOut'

/**
 * Heart toggle for a product. Signed out -> goes to sign-in and comes back to this page. Renders nothing outside
 * the storefront shell (no FavoritesProvider).
 */
export default function FavoriteButton({
  productId,
  name,
  locale,
  variant = 'card',
}: {
  productId: number
  name: string
  locale: Locale
  variant?: 'card' | 'hero'
}) {
  const t = useTranslations('product')
  const router = useRouter()
  const fav = useFavorites()
  const [error, setError] = useState(false)
  if (!fav) return null

  const on = fav.signedIn && fav.isFavorite(productId)
  const label = !fav.signedIn ? t('favoriteSignIn', { name }) : on ? t('favoriteRemove', { name }) : t('favoriteAdd', { name })

  const click = async () => {
    if (!fav.signedIn) {
      router.push(loginHref(locale))
      return
    }
    setError(false)
    const ok = await fav.toggle(productId)
    if (!ok) setError(true)
  }

  const base =
    variant === 'card'
      ? 'rounded-full bg-white/90 p-2 shadow-sm backdrop-blur transition hover:bg-white hover:scale-105'
      : 'flex min-h-11 w-12 shrink-0 items-center self-stretch justify-center rounded-full border border-neutral-200 bg-white transition hover:border-neutral-400'

  return (
    <>
      <button
        type="button"
        onClick={click}
        aria-label={label}
        title={label}
        aria-pressed={fav.signedIn ? on : undefined}
        className={`${base} ${error ? 'ring-2 ring-red-400' : ''}`}
      >
        <Heart
          size={variant === 'card' ? 16 : 18}
          aria-hidden
          className={on ? 'fill-red-500 text-red-500' : 'text-neutral-700'}
          strokeWidth={2}
        />
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {error ? t('favoriteError') : ''}
      </span>
    </>
  )
}
