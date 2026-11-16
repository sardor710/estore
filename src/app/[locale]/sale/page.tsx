import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getSaleProducts } from '@/lib/catalog'
import type { Locale } from '@/i18n/routing'
import ProductGrid from '@/components/store/ProductGrid'

export const dynamic = 'force-dynamic'

export default async function SalePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  const t = await getTranslations({ locale, namespace: 'sale' })
  const products = await getSaleProducts()

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <title>{t('title')}</title>
      <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">{t('title')}</h1>
      <p className="mt-1 text-sm text-neutral-500">{t('subtitle')}</p>
      <div className="mt-8">
        {products.length > 0 ? (
          <ProductGrid products={products} locale={locale} />
        ) : (
          <p className="rounded-2xl bg-neutral-50 px-6 py-12 text-center text-neutral-500">{t('empty')}</p>
        )}
      </div>
    </div>
  )
}
