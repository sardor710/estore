import { getTranslations, setRequestLocale } from 'next-intl/server'

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('store')
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-semibold">{t('name')}</h1>
      <p className="mt-2 text-neutral-600">{t('tagline')}</p>
    </main>
  )
}
