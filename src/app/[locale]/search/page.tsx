import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Search } from 'lucide-react'
import { searchProducts } from '@/lib/catalog'
import type { Locale } from '@/i18n/routing'
import { path } from '@/lib/paths'
import ProductGrid from '@/components/store/ProductGrid'

export const dynamic = 'force-dynamic'

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const { locale: raw } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  const { q: qParam } = await searchParams
  const q = (Array.isArray(qParam) ? qParam[0] : qParam)?.trim().slice(0, 100) ?? ''
  const t = await getTranslations({ locale, namespace: 'search' })
  const tCat = await getTranslations({ locale, namespace: 'category' })
  const results = q ? await searchProducts(q, locale) : []

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <title>{t('title')}</title>
      <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">{t('title')}</h1>
      <form
        action={path(locale, '/search')}
        method="get"
        role="search"
        className="mt-6 flex max-w-xl items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2.5"
      >
        <Search size={16} className="shrink-0 text-neutral-400" aria-hidden />
        <label htmlFor="q" className="sr-only">
          {t('label')}
        </label>
        <input id="q" name="q" defaultValue={q} className="w-full bg-transparent text-sm outline-none" autoComplete="off" />
      </form>

      <div className="mt-8">
        {!q ? (
          <p className="text-neutral-500">{t('prompt')}</p>
        ) : results.length > 0 ? (
          <>
            <p className="mb-6 text-sm text-neutral-500">
              {t('resultsFor', { q })} · {tCat('count', { count: results.length })}
            </p>
            <ProductGrid products={results} locale={locale} />
          </>
        ) : (
          <p className="rounded-2xl bg-neutral-50 px-6 py-12 text-center text-neutral-500">{t('none', { q })}</p>
        )}
      </div>
    </div>
  )
}
