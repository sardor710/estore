import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { routing } from '@/i18n/routing'
import { jsonLdScript, pageMetadata, productDescription, productJsonLd } from '@/lib/seo'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getProductBySlug, getRelated } from '@/lib/catalog'
import type { Locale } from '@/i18n/routing'
import { t as l10n } from '@/lib/localized'
import { path } from '@/lib/paths'
import Breadcrumbs from '@/components/store/Breadcrumbs'
import DetailedProduct from '@/components/store/DetailedProduct'
import SimpleProduct from '@/components/store/SimpleProduct'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const product = await getProductBySlug(slug)
  if (!product) return {}
  const tStore = await getTranslations({ locale, namespace: 'store' })
  return pageMetadata({
    locale,
    path: `/p/${slug}`,
    title: `${l10n(product.title, locale)} — ${tStore('name')}`,
    description: productDescription(product, locale),
    siteName: tStore('name'),
    image: product.images[0],
  })
}

export default async function ProductPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: raw, slug } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  const product = await getProductBySlug(slug)
  if (!product) notFound()
  const related = await getRelated(product.id, 4)
  const title = l10n(product.title, locale)

  const crumbs = [
    ...(product.category.parent
      ? [{ label: l10n(product.category.parent.name, locale), href: path(locale, `/c/${product.category.parent.slug}`) }]
      : []),
    { label: l10n(product.category.name, locale), href: path(locale, `/c/${product.category.slug}`) },
    { label: title },
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(productJsonLd(product, product.variants, locale)) }}
      />
      <Breadcrumbs locale={locale} items={crumbs} />
      {product.template === 'DETAILED' ? (
        <DetailedProduct product={product} related={related} locale={locale} />
      ) : (
        <SimpleProduct product={product} related={related} locale={locale} />
      )}
    </>
  )
}
