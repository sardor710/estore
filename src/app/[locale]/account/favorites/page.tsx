import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Heart } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { requireAccountCustomer } from '@/lib/account/session'
import { listFavorites } from '@/lib/account/favorites'
import { path } from '@/lib/paths'
import { accountMetadata } from '@/components/account/server'
import ProductGrid from '@/components/store/ProductGrid'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return accountMetadata(locale, 'favorites')
}

export default async function AccountFavoritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  const customer = await requireAccountCustomer(locale, path(locale, '/account/favorites'))
  const [products, t] = await Promise.all([listFavorites(customer.id), getTranslations({ locale, namespace: 'account.favorites' })])

  return (
    <div>
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">{t('title')}</h1>
      {products.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-neutral-50 px-6 py-12 text-center">
          <Heart size={32} className="mx-auto text-neutral-400" aria-hidden />
          <p className="mx-auto mt-3 max-w-sm text-neutral-600">{t('empty')}</p>
          <Link href={path(locale)} className="mt-5 inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white hover:bg-black">
            {t('shop')}
          </Link>
        </div>
      ) : (
        <div className="mt-8">
          <ProductGrid products={products} locale={locale} />
        </div>
      )}
    </div>
  )
}
