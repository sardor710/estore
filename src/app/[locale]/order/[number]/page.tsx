import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { CheckCircle2 } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/db'
import { path } from '@/lib/paths'

export const dynamic = 'force-dynamic'

/** Public thank-you page. Deliberately exposes ONLY the number and status, never customer data. */
export default async function OrderPage({ params }: { params: Promise<{ locale: string; number: string }> }) {
  const { locale: raw, number: rawNumber } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  if (!/^\d{1,9}$/.test(rawNumber)) notFound()
  const order = await prisma.order.findUnique({ where: { number: Number(rawNumber) }, select: { number: true, status: true } })
  if (!order) notFound()
  const t = await getTranslations({ locale, namespace: 'order' })
  const known = ['NEW', 'CONFIRMED', 'DELIVERED', 'CANCELLED'].includes(order.status)

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <title>{t('title')}</title>
      <CheckCircle2 size={56} className="mx-auto text-emerald-600" aria-hidden />
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-neutral-900">{t('title')}</h1>
      <p className="mt-2 text-neutral-600">{t('thanks')}</p>
      <div className="mt-8 rounded-2xl bg-neutral-50 px-6 py-6">
        <p className="text-sm text-neutral-500">{t('number')}</p>
        <p className="mt-1 text-4xl font-extrabold tabular-nums text-neutral-900">#{order.number}</p>
        {known && (
          <p className="mt-3 text-sm text-neutral-600">
            {t('status')}: <span className="font-semibold text-neutral-900">{t(`statuses.${order.status as 'NEW'}`)}</span>
          </p>
        )}
      </div>
      <p className="mt-6 text-neutral-700">{t('callText')}</p>
      <Link href={path(locale)} className="mt-8 inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white hover:bg-neutral-700">
        {t('backToShop')}
      </Link>
    </div>
  )
}
