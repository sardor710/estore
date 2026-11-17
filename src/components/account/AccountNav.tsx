'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Heart, LayoutGrid, MapPin, Package, UserRound } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { path } from '@/lib/paths'

const SECTIONS = [
  { key: 'overview', href: '', Icon: LayoutGrid },
  { key: 'orders', href: '/orders', Icon: Package },
  { key: 'addresses', href: '/addresses', Icon: MapPin },
  { key: 'favorites', href: '/favorites', Icon: Heart },
  { key: 'profile', href: '/profile', Icon: UserRound },
] as const

/** Side nav on desktop, horizontally scrollable pill bar on mobile (scrolls inside itself, never the page). */
export default function AccountNav({ locale }: { locale: Locale }) {
  const t = useTranslations('account.nav')
  const pathname = usePathname() ?? ''
  const base = path(locale, '/account')

  return (
    <nav aria-label={t('label')} className="-mx-4 overflow-x-auto px-4 pb-1 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-2 lg:flex-col lg:gap-1">
        {SECTIONS.map(({ key, href, Icon }) => {
          const target = `${base}${href}`
          const active = href === '' ? pathname === base : pathname === target || pathname.startsWith(`${target}/`)
          return (
            <li key={key} className="shrink-0">
              <Link
                href={target}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition lg:rounded-xl lg:py-2.5 ${
                  active ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 lg:bg-transparent lg:hover:bg-neutral-100'
                }`}
              >
                <Icon size={16} aria-hidden className={active ? 'text-white' : 'text-neutral-400'} />
                {t(key)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
