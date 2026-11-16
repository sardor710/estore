import Link from 'next/link'
import { BatteryCharging, Cable, Camera, Headphones, Package, Smartphone, Watch, Zap, type LucideIcon } from 'lucide-react'
import type { CategoryNode } from '@/lib/catalog'
import type { Locale } from '@/i18n/routing'
import { t as l10n } from '@/lib/localized'
import { path } from '@/lib/paths'

const ICONS: Record<string, LucideIcon> = {
  chargers: Zap,
  'power-banks': BatteryCharging,
  audio: Headphones,
  wearables: Watch,
  'cameras-smart-home': Camera,
  'cables-hubs': Cable,
  'cases-accessories': Smartphone,
}

export default function CategoryTiles({ categories, locale }: { categories: CategoryNode[]; locale: Locale }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {categories.map((c) => {
        const Icon = ICONS[c.slug] ?? Package
        return (
          <li key={c.id}>
            <Link
              href={path(locale, `/c/${c.slug}`)}
              className="group flex h-full min-h-28 flex-col justify-between rounded-2xl border border-neutral-100 bg-neutral-50 p-4 transition hover:border-neutral-300 hover:bg-white hover:shadow-md sm:p-5"
            >
              <Icon size={26} className="text-neutral-900" aria-hidden />
              <span className="mt-6 text-sm font-semibold leading-snug text-neutral-900 sm:text-base">{l10n(c.name, locale)}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
