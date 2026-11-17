import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ArrowLeft } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { requireAccountCustomer } from '@/lib/account/session'
import { getAccountOrder } from '@/lib/account/orders'
import { formatUzs } from '@/lib/money'
import { path } from '@/lib/paths'
import { accountMetadata, regionName } from '@/components/account/server'
import { formatDateTime, formatDay, formatPhone, isOrderStatus } from '@/components/account/format'
import StatusBadge from '@/components/account/StatusBadge'
import BuyAgainButton from '@/components/account/BuyAgainButton'

export const dynamic = 'force-dynamic'

type Params = Promise<{ locale: string; number: string }>

const parseNumber = (s: string): number | null => (/^\d{1,9}$/.test(s) ? Number(s) : null)

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, number } = await params
  return accountMetadata(locale, 'order', { number: parseNumber(number) ?? '' })
}

export default async function AccountOrderPage({ params }: { params: Params }) {
  const { locale: raw, number: rawNumber } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  const number = parseNumber(rawNumber)
  const customer = await requireAccountCustomer(locale, path(locale, `/account/orders/${number ?? ''}`))
  if (number === null) notFound()
  // Scoped by the account phone: another customer's order number is indistinguishable from a missing one.
  const order = await getAccountOrder(customer.phone, number)
  if (!order) notFound()

  const [t, tOrders, tStatus] = await Promise.all([
    getTranslations({ locale, namespace: 'account.order' }),
    getTranslations({ locale, namespace: 'account.orders' }),
    getTranslations({ locale, namespace: 'account.statuses' }),
  ])
  const statusLabel = (s: string) => (isOrderStatus(s) ? tStatus(s) : s)
  const section = 'rounded-2xl border border-neutral-100 bg-white p-5 sm:p-6'
  const sectionTitle = 'text-xs font-bold uppercase tracking-widest text-neutral-500'

  return (
    <div>
      <Link
        href={path(locale, '/account/orders')}
        className="inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-neutral-600 hover:text-neutral-900"
      >
        <ArrowLeft size={15} aria-hidden /> {t('back')}
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
          {tOrders('number', { number: order.number })}
        </h1>
        <StatusBadge status={order.status} label={statusLabel(order.status)} />
      </div>
      <p className="mt-2 text-sm text-neutral-500">{tOrders('placed', { date: formatDay(order.createdAt, locale) })}</p>

      <div className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="od-items" className={section}>
          <h2 id="od-items" className={sectionTitle}>
            {t('items')}
          </h2>
          <ul className="mt-2 divide-y divide-neutral-100">
            {order.lines.map((l, i) => {
              const lineTotal = l.priceUzs * l.qty
              const original = l.originalPriceUzs != null && l.originalPriceUzs > l.priceUzs ? l.originalPriceUzs * l.qty : null
              const title = l.slug ? (
                <Link href={path(locale, `/p/${l.slug}`)} className="font-semibold text-neutral-900 hover:underline">
                  {l.productTitle}
                </Link>
              ) : (
                <span className="font-semibold text-neutral-900">{l.productTitle}</span>
              )
              return (
                <li key={`${l.variantId}-${i}`} className="flex gap-4 py-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f6f6f7] p-1.5 sm:h-20 sm:w-20">
                    {l.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.image} alt="" loading="lazy" className="h-full w-full object-contain" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="break-words">{title}</p>
                    {l.variantName && <p className="text-neutral-500">{l.variantName}</p>}
                    <p className="text-neutral-500">
                      {t('qty', { qty: l.qty })} · {formatUzs(l.priceUzs, locale)}
                    </p>
                    {l.discountUzs > 0 && <p className="text-xs font-semibold text-emerald-700">{t('discount', { amount: formatUzs(l.discountUzs, locale) })}</p>}
                    {!l.slug && <p className="text-xs text-neutral-400">{t('productGone')}</p>}
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    <p className="font-semibold text-neutral-900">{formatUzs(lineTotal, locale)}</p>
                    {original && <s className="text-xs text-neutral-400">{formatUzs(original, locale)}</s>}
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="flex items-baseline justify-between border-t border-neutral-200 pt-4">
            <span className="text-sm text-neutral-600">{t('total')}</span>
            <span className="text-xl font-extrabold text-neutral-900">{formatUzs(order.totalUzs, locale)}</span>
          </div>
          <div className="mt-6">
            <BuyAgainButton orderNumber={order.number} locale={locale} />
          </div>
        </section>

        <div className="space-y-4">
          <section aria-labelledby="od-delivery" className={section}>
            <h2 id="od-delivery" className={sectionTitle}>
              {t('delivery')}
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-neutral-500">{t('recipient')}</dt>
                <dd className="font-semibold text-neutral-900">{order.name}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">{t('phone')}</dt>
                <dd className="text-neutral-900">{formatPhone(order.phone)}</dd>
              </div>
              <div>
                <dt className="sr-only">{t('delivery')}</dt>
                <dd className="text-neutral-700">
                  {regionName(order.region, locale)}
                  <br />
                  <span className="break-words">{order.address}</span>
                </dd>
              </div>
              {order.comment && (
                <div>
                  <dt className="text-neutral-500">{t('comment')}</dt>
                  <dd className="break-words text-neutral-700">{order.comment}</dd>
                </div>
              )}
            </dl>
          </section>

          <section aria-labelledby="od-timeline" className={section}>
            <h2 id="od-timeline" className={sectionTitle}>
              {t('timeline')}
            </h2>
            <ol className="mt-4 space-y-4 border-l border-neutral-200 pl-5">
              {order.events.map((e, i) => {
                const latest = i === order.events.length - 1
                return (
                  <li key={`${e.status}-${i}`} className="relative">
                    <span
                      aria-hidden
                      className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${latest ? 'bg-neutral-900' : 'bg-neutral-300'}`}
                    />
                    <p className={`text-sm ${latest ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-700'}`}>
                      {e.status === 'NEW' ? t('placed') : statusLabel(e.status)}
                    </p>
                    {/* Orders from before status history existed get their current status without a time. */}
                    {e.at ? (
                      <p className="text-xs text-neutral-500">
                        <time dateTime={new Date(e.at).toISOString()}>{formatDateTime(e.at, locale)}</time>
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}
