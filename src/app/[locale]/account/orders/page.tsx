import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ChevronRight, Package } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { requireAccountCustomer } from '@/lib/account/session'
import { listAccountOrders } from '@/lib/account/orders'
import { formatUzs } from '@/lib/money'
import { path } from '@/lib/paths'
import { accountMetadata } from '@/components/account/server'
import { formatDay, isOrderStatus } from '@/components/account/format'
import StatusBadge from '@/components/account/StatusBadge'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return accountMetadata(locale, 'orders')
}

export default async function AccountOrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  const customer = await requireAccountCustomer(locale, path(locale, '/account/orders'))
  const [orders, t, tStatus] = await Promise.all([
    listAccountOrders(customer.phone),
    getTranslations({ locale, namespace: 'account.orders' }),
    getTranslations({ locale, namespace: 'account.statuses' }),
  ])

  return (
    <div>
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">{t('title')}</h1>
      {orders.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-neutral-50 px-6 py-12 text-center">
          <Package size={32} className="mx-auto text-neutral-400" aria-hidden />
          <p className="mt-3 text-neutral-600">{t('empty')}</p>
          <Link href={path(locale)} className="mt-5 inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white hover:bg-black">
            {t('shop')}
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {orders.map((o) => (
            <li key={o.number}>
              <Link
                href={path(locale, `/account/orders/${o.number}`)}
                className="group flex items-center gap-4 rounded-2xl border border-neutral-100 bg-white p-4 transition hover:border-neutral-300 hover:shadow-sm sm:p-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-base font-bold text-neutral-900">{t('number', { number: o.number })}</span>
                    <StatusBadge status={o.status} label={isOrderStatus(o.status) ? tStatus(o.status) : o.status} />
                  </div>
                  <p className="mt-1.5 text-sm text-neutral-500">
                    {t('placed', { date: formatDay(o.createdAt, locale) })} · {t('items', { count: o.itemsCount })}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="sr-only">{t('total')}: </span>
                  <span className="text-sm font-bold text-neutral-900 sm:text-base">{formatUzs(o.totalUzs, locale)}</span>
                  <span className="mt-1 hidden items-center justify-end gap-1 text-xs font-semibold text-neutral-500 group-hover:text-neutral-900 sm:flex">
                    {t('view')} <ChevronRight size={14} aria-hidden />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
