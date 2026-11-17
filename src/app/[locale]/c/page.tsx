import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { getNavCategories } from '@/lib/catalog'
import CategoryTiles from '@/components/store/CategoryTiles'

export const dynamic = 'force-dynamic'

// Catalog index (the Telegram Mini App "Catalog" tab; also reachable on the website). Category pages are indexed,
// this list adds nothing for search engines.
export const metadata: Metadata = { robots: { index: false, follow: true } }

export default async function CatalogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  const [categories, t] = await Promise.all([getNavCategories(), getTranslations({ locale, namespace: 'tg' })])
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="font-[family-name:var(--font-heading)] text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl">{t('catalogTitle')}</h1>
      <div className="mt-5">
        {categories.length ? <CategoryTiles categories={categories} locale={locale} /> : <p className="text-sm text-neutral-500">{t('catalogEmpty')}</p>}
      </div>
    </div>
  )
}
