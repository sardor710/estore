import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import { requireAccountCustomer } from '@/lib/account/session'
import { path } from '@/lib/paths'
import { accountMetadata } from '@/components/account/server'
import ProfileForm from '@/components/account/ProfileForm'
import { Avatar } from '@/components/account/ProfileCard'
import { formatPhone } from '@/components/account/format'
import { isTelegramMode } from '@/lib/tg/mode'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return accountMetadata(locale, 'profile')
}

export default async function AccountProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  const c = await requireAccountCustomer(locale, path(locale, '/account/profile'))
  const t = await getTranslations({ locale, namespace: 'account.profile' })

  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar name={c.name} size="lg" />
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">{t('title')}</h1>
          <p className="mt-1 truncate text-sm text-neutral-500">{c.name.trim() ? `${c.name} · ${formatPhone(c.phone)}` : formatPhone(c.phone)}</p>
        </div>
      </div>
      <ProfileForm
        locale={locale}
        profile={{ name: c.name, phone: c.phone, locale: c.locale, notifyTelegram: c.notifyTelegram }}
        telegram={await isTelegramMode()}
      />
    </div>
  )
}
