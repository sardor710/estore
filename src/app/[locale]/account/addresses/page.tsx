import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { requireAccountCustomer } from '@/lib/account/session'
import { listAddresses, MAX_ADDRESSES } from '@/lib/account/addresses'
import { REGIONS } from '@/lib/regions'
import { t as l10n } from '@/lib/localized'
import { path } from '@/lib/paths'
import { accountMetadata } from '@/components/account/server'
import AddressesManager from '@/components/account/AddressesManager'
import { cleanLatLng } from '@/lib/geo'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return accountMetadata(locale, 'addresses')
}

export default async function AccountAddressesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ lat?: string | string[]; lng?: string | string[] }>
}) {
  const { locale: raw } = await params
  const q = await searchParams
  // ?lat=&lng= from the bot's "New address" button (a location sent in the chat).
  const num = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : undefined)
  const pin = cleanLatLng(num(q.lat), num(q.lng))
  const prefillPin = pin && pin !== 'INVALID' ? pin : null
  setRequestLocale(raw)
  const locale = raw as Locale
  const customer = await requireAccountCustomer(locale, path(locale, '/account/addresses'))
  const [rows, t] = await Promise.all([listAddresses(customer.id), getTranslations({ locale, namespace: 'account.addresses' })])
  const addresses = rows.map((a) => ({
    id: a.id,
    label: a.label,
    recipient: a.recipient,
    region: a.region,
    address: a.address,
    isDefault: a.isDefault,
    lat: a.lat,
    lng: a.lng,
  }))
  const regions = REGIONS.map((r) => ({ code: r.code, name: l10n(r.name, locale) }))

  return (
    <div>
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">{t('title')}</h1>
      <p className="mt-2 text-sm text-neutral-600">{t('intro')}</p>
      <AddressesManager addresses={addresses} regions={regions} max={MAX_ADDRESSES} defaultRecipient={customer.name} prefillPin={prefillPin} />
    </div>
  )
}
