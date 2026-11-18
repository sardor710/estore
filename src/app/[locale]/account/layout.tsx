import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { getAccountCustomer } from '@/lib/account/session'
import AccountNav from '@/components/account/AccountNav'
import ProfileCard from '@/components/account/ProfileCard'
import { path } from '@/lib/paths'

// Account pages are never indexed (each page also sets its own localized title + robots).
export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * Account shell. A layout does not know the requested path, so the sign-in redirect (with `next` = that path)
 * is done by every page via requireAccountCustomer; signed out, this layout renders the page bare and the page
 * redirects before anything is sent.
 */
export default async function AccountLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  const locale = raw as Locale
  const customer = await getAccountCustomer()
  if (!customer) return <>{children}</>
  const [t, tAcc] = await Promise.all([getTranslations({ locale, namespace: 'nav' }), getTranslations({ locale, namespace: 'account' })])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
        <aside className="min-w-0 space-y-4">
          <ProfileCard name={customer.name} phone={customer.phone} editHref={path(locale, '/account/profile')} editLabel={tAcc('card.edit')} />
          <p className="hidden px-4 pt-2 text-xs font-bold uppercase tracking-widest text-neutral-500 lg:block">{t('myAccount')}</p>
          <AccountNav locale={locale} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
