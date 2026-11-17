import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { getAccountCustomer } from '@/lib/account/session'
import { safeNext } from '@/lib/account/next'
import { path } from '@/lib/paths'
import { accountMetadata } from '@/components/account/server'
import LoginPanel from '@/components/account/LoginPanel'
import TgPhoneGate from '@/components/tg/TgPhoneGate'
import { isTelegramMode } from '@/lib/tg/mode'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return accountMetadata(locale, 'login')
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { locale: raw } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  const { next: rawNext } = await searchParams
  // Validated here (same-site locale path only); never back to the login page itself.
  let next = safeNext(typeof rawNext === 'string' ? rawNext : null, locale)
  if (/^\/(uz|ru|en)\/login(\/|\?|$)/.test(next)) next = path(locale, '/account')

  if (await getAccountCustomer()) redirect(next)

  // Inside the Telegram Mini App the user is already identified by Telegram: one tap shares the phone instead.
  if (await isTelegramMode()) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <TgPhoneGate next={next} />
      </div>
    )
  }

  const t = await getTranslations({ locale, namespace: 'account.login' })
  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-center font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">
        {t('title')}
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-center text-sm text-neutral-600">{t('subtitle')}</p>
      <LoginPanel next={next} />
    </div>
  )
}
