import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { CategoryNode } from '@/lib/catalog'
import type { Locale } from '@/i18n/routing'
import { t as l10n } from '@/lib/localized'
import { path } from '@/lib/paths'

export default async function Footer({ locale, categories }: { locale: Locale; categories: CategoryNode[] }) {
  const t = await getTranslations({ locale, namespace: 'footer' })
  const tStore = await getTranslations({ locale, namespace: 'store' })
  const tNav = await getTranslations({ locale, namespace: 'nav' })
  return (
    <footer className="mt-24 border-t border-neutral-200 bg-neutral-950 text-neutral-400">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <p className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-white">{tStore('name')}</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed">{t('about')}</p>
        </div>
        <div className="md:col-span-2">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-300">{t('shop')}</p>
          <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={path(locale, `/c/${c.slug}`)} className="transition hover:text-white">
                  {l10n(c.name, locale)}
                </Link>
              </li>
            ))}
            <li>
              <Link href={path(locale, '/sale')} className="transition hover:text-white">
                {tNav('sale')}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-neutral-800 px-4 py-5 text-center text-xs sm:px-6">
        © {new Date().getFullYear()} {tStore('name')}. {t('rights')}
      </div>
    </footer>
  )
}
