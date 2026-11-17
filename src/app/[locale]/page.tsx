import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { routing } from '@/i18n/routing'
import { pageMetadata } from '@/lib/seo'
import Link from 'next/link'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getNavCategories, getNewArrivals, getSaleProducts } from '@/lib/catalog'
import type { Locale } from '@/i18n/routing'
import { path } from '@/lib/paths'
import { getActiveBanners } from '@/lib/banners'
import HeroBanner from '@/components/store/HeroBanner'
import CategoryTiles from '@/components/store/CategoryTiles'
import ProductGrid from '@/components/store/ProductGrid'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const tStore = await getTranslations({ locale, namespace: 'store' })
  const tSeo = await getTranslations({ locale, namespace: 'seo' })
  return pageMetadata({
    locale,
    path: '/',
    title: `${tStore('name')} — ${tStore('tagline')}`,
    description: tSeo('homeDescription'),
    siteName: tStore('name'),
  })
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  const t = await getTranslations({ locale, namespace: 'home' })
  const [categories, arrivals, sale, banners] = await Promise.all([getNavCategories(), getNewArrivals(8), getSaleProducts(), getActiveBanners(locale)])

  return (
    <>
      <HeroBanner locale={locale} banners={banners} />

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-14 sm:px-6 lg:space-y-20 lg:px-8 lg:py-20">
        <section aria-labelledby="cats-h">
          <h2 id="cats-h" className="mb-6 text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl">
            {t('categoriesTitle')}
          </h2>
          <CategoryTiles categories={categories} locale={locale} />
        </section>

        {arrivals.length > 0 ? (
          <section aria-labelledby="new-h">
            <h2 id="new-h" className="mb-6 text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl">
              {t('newArrivals')}
            </h2>
            <ProductGrid products={arrivals} locale={locale} />
          </section>
        ) : (
          <p className="rounded-2xl bg-neutral-50 px-6 py-10 text-center text-neutral-500">{t('empty')}</p>
        )}

        {sale.length > 0 && (
          <section aria-labelledby="sale-h">
            <div className="mb-6 flex items-end justify-between gap-4">
              <h2 id="sale-h" className="text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl">
                {t('onSale')}
              </h2>
              <Link href={path(locale, '/sale')} className="text-sm font-semibold text-neutral-900 underline-offset-4 hover:underline">
                {t('viewAll')}
              </Link>
            </div>
            <ProductGrid products={sale.slice(0, 4)} locale={locale} />
          </section>
        )}
      </div>
    </>
  )
}
