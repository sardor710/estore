'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { locales, type Locale } from '@/i18n/routing'

const LABELS: Record<Locale, string> = { uz: 'OʻZ', ru: 'РУС', en: 'EN' }

/** Links to the same path (and query) in the other locales. */
export default function LangSwitcher({ locale }: { locale: Locale }) {
  const t = useTranslations('nav')
  const pathname = usePathname() || `/${locale}`
  const search = useSearchParams().toString()
  const rest = pathname.replace(new RegExp(`^/(${locales.join('|')})(?=/|$)`), '')
  const suffix = `${rest}${search ? `?${search}` : ''}`

  return (
    <nav aria-label={t('language')} className="flex items-center rounded-full border border-neutral-200 p-0.5 text-[11px] font-semibold">
      {locales.map((l) => (
        <Link
          key={l}
          href={`/${l}${suffix}`}
          hrefLang={l}
          lang={l}
          aria-current={l === locale ? 'true' : undefined}
          className={`rounded-full px-2.5 py-1 transition ${
            l === locale ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          {LABELS[l]}
        </Link>
      ))}
    </nav>
  )
}
