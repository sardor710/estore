import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ChevronRight } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { path } from '@/lib/paths'

export type Crumb = { label: string; href?: string }

export default async function Breadcrumbs({ locale, items }: { locale: Locale; items: Crumb[] }) {
  const t = await getTranslations({ locale, namespace: 'product' })
  const tStore = await getTranslations({ locale, namespace: 'store' })
  const all: Crumb[] = [{ label: tStore('name'), href: path(locale) }, ...items]
  return (
    <nav aria-label={t('breadcrumb')} className="border-b border-neutral-100">
      <ol className="mx-auto flex max-w-7xl flex-wrap items-center gap-1.5 px-4 py-3 text-xs text-neutral-500 sm:px-6 lg:px-8">
        {all.map((c, i) => {
          const last = i === all.length - 1
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
              {c.href && !last ? (
                <Link href={c.href} className="transition hover:text-black">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={last ? 'max-w-[40ch] truncate font-semibold text-neutral-900' : ''}>
                  {c.label}
                </span>
              )}
              {!last && <ChevronRight size={12} aria-hidden />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
