import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { CategoryNode } from '@/lib/catalog'
import type { Locale } from '@/i18n/routing'
import { t as l10n } from '@/lib/localized'
import { path } from '@/lib/paths'
import { getShopDetails } from '@/lib/settings'
import { BOT_HANDLE, legalContent, LEGAL_DOCS } from '@/lib/legal'

export default async function Footer({ locale, categories }: { locale: Locale; categories: CategoryNode[] }) {
  const t = await getTranslations({ locale, namespace: 'footer' })
  const tStore = await getTranslations({ locale, namespace: 'store' })
  const tNav = await getTranslations({ locale, namespace: 'nav' })
  const shop = await getShopDetails()
  const legal = legalContent(locale).labels
  const tg = shop.shopTelegram || BOT_HANDLE
  return (
    <footer className="mt-24 border-t border-neutral-200 bg-neutral-950 text-neutral-400">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <p className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-white">{tStore('name')}</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed">{t('about')}</p>
          <ul className="mt-4 space-y-1 text-sm">
            {shop.shopPhone ? (
              <li>
                <a href={`tel:${shop.shopPhone.replace(/[^\d+]/g, '')}`} className="transition hover:text-white">{shop.shopPhone}</a>
              </li>
            ) : null}
            <li>
              <a href={`https://t.me/${tg.slice(1)}`} target="_blank" rel="noopener noreferrer" className="transition hover:text-white">Telegram: {tg}</a>
            </li>
            {shop.shopEmail ? (
              <li>
                <a href={`mailto:${shop.shopEmail}`} className="transition hover:text-white">{shop.shopEmail}</a>
              </li>
            ) : null}
            {shop.shopHours ? <li>{shop.shopHours}</li> : null}
            {shop.shopAddress ? <li>{shop.shopAddress}</li> : null}
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-300">{legal.footer}</p>
          <ul className="mt-4 space-y-2 text-sm">
            {LEGAL_DOCS.map((d) => (
              <li key={d}>
                <Link href={path(locale, `/legal/${d}`)} className="transition hover:text-white">
                  {legal.short[d]}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-300">{t('shop')}</p>
          <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
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
            <li>
              <Link href={path(locale, '/blog')} className="transition hover:text-white">
                {tNav('blog')}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-neutral-800 px-4 py-5 text-center text-xs sm:px-6">
        © {new Date().getFullYear()} {shop.shopLegalName || tStore('name')}. {t('rights')}
        {shop.shopInn ? ` ${legal.inn}: ${shop.shopInn}` : ''}
      </div>
    </footer>
  )
}
