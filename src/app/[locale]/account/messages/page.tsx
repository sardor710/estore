import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { MessageSquare } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { requireAccountCustomer } from '@/lib/account/session'
import { listAccountMessages, markMessagesRead } from '@/lib/customer-messages'
import { path } from '@/lib/paths'
import { accountMetadata } from '@/components/account/server'
import { formatDateTime } from '@/components/account/format'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  return accountMetadata(locale, 'messages')
}

/** Messages the shop sent (one-way). Opening the page marks them read; the ones unread until now are highlighted. */
export default async function AccountMessagesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  const customer = await requireAccountCustomer(locale, path(locale, '/account/messages'))
  const [messages, t] = await Promise.all([listAccountMessages(customer.id), getTranslations({ locale, namespace: 'account.messages' })])
  if (messages.some((m) => !m.readAt)) await markMessagesRead(customer.id)

  return (
    <div>
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">{t('title')}</h1>
      {messages.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-neutral-50 px-6 py-12 text-center">
          <MessageSquare size={32} className="mx-auto text-neutral-400" aria-hidden />
          <p className="mx-auto mt-3 max-w-sm text-neutral-600">{t('empty')}</p>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {messages.map((m) => (
            <li key={m.id} className={`rounded-2xl border p-5 ${m.readAt ? 'border-neutral-200 bg-white' : 'border-neutral-900 bg-neutral-50'}`}>
              <div className="mb-2 flex items-center gap-2 text-xs text-neutral-500">
                <time dateTime={m.createdAt.toISOString()}>{formatDateTime(m.createdAt, locale)}</time>
                {!m.readAt ? <span className="rounded-full bg-neutral-900 px-2 py-0.5 font-semibold text-white">{t('new')}</span> : null}
              </div>
              <p className="whitespace-pre-line break-words text-neutral-900">{m.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
