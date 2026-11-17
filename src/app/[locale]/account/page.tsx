import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ChevronRight, Heart, MapPin, Package, UserRound } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { requireAccountCustomer } from '@/lib/account/session'
import { listAccountOrders } from '@/lib/account/orders'
import { listAddresses } from '@/lib/account/addresses'
import { formatUzs } from '@/lib/money'
import { path } from '@/lib/paths'
import { accountMetadata, regionName } from '@/components/account/server'
import { formatDay, formatPhone, isOrderStatus } from '@/components/account/format'
import StatusBadge from '@/components/account/StatusBadge'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return accountMetadata(locale, 'overview')
}

export default async function AccountOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  const customer = await requireAccountCustomer(locale, path(locale, '/account'))
  const [orders, addresses, t, tStatus] = await Promise.all([
    listAccountOrders(customer.phone),
    listAddresses(customer.id),
    getTranslations({ locale, namespace: 'account' }),
    getTranslations({ locale, namespace: 'account.statuses' }),
  ])
  const last = orders[0]
  const def = addresses.find((a) => a.isDefault) ?? addresses[0]

  const card = 'rounded-2xl border border-neutral-100 bg-white p-5 sm:p-6'
  const cardTitle = 'text-xs font-bold uppercase tracking-widest text-neutral-500'
  const quick = [
    { href: '/account/orders', label: t('nav.orders'), hint: t('overview.ordersHint'), Icon: Package },
    { href: '/account/addresses', label: t('nav.addresses'), hint: t('overview.addressesHint'), Icon: MapPin },
    { href: '/account/favorites', label: t('nav.favorites'), hint: t('overview.favoritesHint'), Icon: Heart },
    { href: '/account/profile', label: t('nav.profile'), hint: t('overview.profileHint'), Icon: UserRound },
  ]

  return (
    <div>
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
        {t('overview.greeting', { name: customer.name || formatPhone(customer.phone) })}
      </h1>
      <p className="mt-2 text-sm text-neutral-600">{t('overview.intro')}</p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section aria-labelledby="ov-last" className={card}>
          <h2 id="ov-last" className={cardTitle}>
            {t('overview.lastOrder')}
          </h2>
          {last ? (
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-lg font-bold text-neutral-900">{t('orders.number', { number: last.number })}</p>
                <StatusBadge status={last.status} label={isOrderStatus(last.status) ? tStatus(last.status) : last.status} />
              </div>
              <p className="mt-1 text-sm text-neutral-500">
                {t('orders.placed', { date: formatDay(last.createdAt, locale) })} · {t('orders.items', { count: last.itemsCount })}
              </p>
              <p className="mt-3 text-base font-semibold text-neutral-900">{formatUzs(last.totalUzs, locale)}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={path(locale, `/account/orders/${last.number}`)}
                  className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black"
                >
                  {t('overview.viewOrder')}
                </Link>
                <Link
                  href={path(locale, '/account/orders')}
                  className="rounded-full border border-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-800 hover:border-neutral-400"
                >
                  {t('overview.allOrders')}
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-neutral-600">{t('overview.noOrders')}</p>
              <Link href={path(locale)} className="mt-4 inline-block rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black">
                {t('overview.startShopping')}
              </Link>
            </div>
          )}
        </section>

        <section aria-labelledby="ov-address" className={card}>
          <h2 id="ov-address" className={cardTitle}>
            {t('overview.defaultAddress')}
          </h2>
          {def ? (
            <div className="mt-4 text-sm">
              {def.label && <p className="font-bold text-neutral-900">{def.label}</p>}
              <p className="font-semibold text-neutral-900">{def.recipient}</p>
              <p className="mt-1 text-neutral-600">{regionName(def.region, locale)}</p>
              <p className="break-words text-neutral-600">{def.address}</p>
              <Link
                href={path(locale, '/account/addresses')}
                className="mt-4 inline-block rounded-full border border-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-800 hover:border-neutral-400"
              >
                {t('overview.manageAddresses')}
              </Link>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-neutral-600">{t('overview.noAddress')}</p>
              <Link
                href={path(locale, '/account/addresses')}
                className="mt-4 inline-block rounded-full border border-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-800 hover:border-neutral-400"
              >
                {t('overview.addAddress')}
              </Link>
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="ov-quick" className="mt-8">
        <h2 id="ov-quick" className={cardTitle}>
          {t('overview.quickLinks')}
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {quick.map(({ href, label, hint, Icon }) => (
            <li key={href}>
              <Link
                href={path(locale, href)}
                className="group flex items-center gap-4 rounded-2xl border border-neutral-100 bg-white p-4 transition hover:border-neutral-300 hover:shadow-sm"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
                  <Icon size={18} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-neutral-900">{label}</span>
                  <span className="block truncate text-xs text-neutral-500">{hint}</span>
                </span>
                <ChevronRight size={16} aria-hidden className="text-neutral-400 transition group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
