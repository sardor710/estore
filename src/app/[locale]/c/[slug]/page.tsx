import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getCategoryPage, type SortKey } from '@/lib/catalog'
import type { Locale } from '@/i18n/routing'
import { t as l10n } from '@/lib/localized'
import { path } from '@/lib/paths'
import Breadcrumbs from '@/components/store/Breadcrumbs'
import ProductGrid from '@/components/store/ProductGrid'

export const dynamic = 'force-dynamic'

const SORTS: { key: SortKey; label: 'sortNew' | 'sortPriceAsc' | 'sortPriceDesc' }[] = [
  { key: 'new', label: 'sortNew' },
  { key: 'price-asc', label: 'sortPriceAsc' },
  { key: 'price-desc', label: 'sortPriceDesc' },
]

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>
  searchParams: Promise<{ sort?: string }>
}) {
  const { locale: raw, slug } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  const { sort: sortParam } = await searchParams
  const sort: SortKey = SORTS.some((s) => s.key === sortParam) ? (sortParam as SortKey) : 'new'
  const page = await getCategoryPage(slug, { sort })
  if (!page) notFound()
  const t = await getTranslations({ locale, namespace: 'category' })
  const name = l10n(page.category.name, locale)
  const base = path(locale, `/c/${slug}`)

  const crumbs = [
    ...(page.parent ? [{ label: l10n(page.parent.name, locale), href: path(locale, `/c/${page.parent.slug}`) }] : []),
    { label: name },
  ]

  return (
    <>
      <title>{name}</title>
      <Breadcrumbs locale={locale} items={crumbs} />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">{name}</h1>
            <p className="mt-1 text-sm text-neutral-500">{t('count', { count: page.products.length })}</p>
          </div>
          <nav aria-label={t('sortLabel')} className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{t('sortLabel')}</span>
            {SORTS.map((s) => (
              <Link
                key={s.key}
                href={s.key === 'new' ? base : `${base}?sort=${s.key}`}
                aria-current={sort === s.key ? 'true' : undefined}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                  sort === s.key ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700 hover:border-neutral-400'
                }`}
              >
                {t(s.label)}
              </Link>
            ))}
          </nav>
        </div>

        {page.category.children.length > 0 && (
          <nav aria-label={t('subcategories')} className="mb-8 flex flex-wrap gap-2">
            {page.category.children.map((c) => (
              <Link
                key={c.id}
                href={path(locale, `/c/${c.slug}`)}
                className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-200"
              >
                {l10n(c.name, locale)}
              </Link>
            ))}
          </nav>
        )}

        {page.products.length > 0 ? (
          <ProductGrid products={page.products} locale={locale} />
        ) : (
          <p className="rounded-2xl bg-neutral-50 px-6 py-12 text-center text-neutral-500">{t('empty')}</p>
        )}
      </div>
    </>
  )
}
