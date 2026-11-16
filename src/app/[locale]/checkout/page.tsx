import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { REGIONS } from '@/lib/regions'
import { t as l10n } from '@/lib/localized'
import CheckoutForm from '@/components/store/CheckoutForm'

export const dynamic = 'force-dynamic'

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  const t = await getTranslations({ locale, namespace: 'checkout' })
  const regions = REGIONS.map((r) => ({ code: r.code, name: l10n(r.name, locale) }))

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <title>{t('title')}</title>
      <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">{t('title')}</h1>
      <CheckoutForm locale={locale} regions={regions} />
    </div>
  )
}
