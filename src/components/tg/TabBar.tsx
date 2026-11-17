'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { House, LayoutGrid, Package, ShoppingBag, UserRound } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { useCart, useCartDrawer } from '@/lib/cart/useCart'

/** Bottom tab bar of the Telegram Mini App (replaces the website header menu and footer). */
export default function TabBar({ locale }: { locale: Locale }) {
  const t = useTranslations('tg.tabs')
  const pathname = (usePathname() || `/${locale}`).replace(/\/+$/, '')
  const { count } = useCart()
  const { open: cartOpen, setOpen: setCartOpen } = useCartDrawer()

  const home = `/${locale}`
  const catalog = `/${locale}/c`
  const orders = `/${locale}/account/orders`
  const profile = `/${locale}/account`
  const active = {
    home: pathname === home,
    catalog: pathname === catalog || pathname.startsWith(`${catalog}/`),
    orders: pathname.startsWith(orders),
    profile: pathname.startsWith(profile) && !pathname.startsWith(orders),
  }
  const item = (on: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${on ? 'text-neutral-900' : 'text-neutral-400'}`

  return (
    <nav
      aria-label={t('label')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-lg">
        <Link href={home} className={item(active.home)} aria-current={active.home ? 'page' : undefined}>
          <House size={22} aria-hidden />
          {t('home')}
        </Link>
        <Link href={catalog} className={item(active.catalog)} aria-current={active.catalog ? 'page' : undefined}>
          <LayoutGrid size={22} aria-hidden />
          {t('catalog')}
        </Link>
        <button type="button" onClick={() => setCartOpen(true)} className={item(cartOpen)} aria-haspopup="dialog">
          <span className="relative">
            <ShoppingBag size={22} aria-hidden />
            {count > 0 && (
              <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-neutral-900 px-1 text-center text-[10px] font-bold leading-4 text-white">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </span>
          {t('cart')}
        </button>
        <Link href={orders} className={item(active.orders)} aria-current={active.orders ? 'page' : undefined}>
          <Package size={22} aria-hidden />
          {t('orders')}
        </Link>
        <Link href={profile} className={item(active.profile)} aria-current={active.profile ? 'page' : undefined}>
          <UserRound size={22} aria-hidden />
          {t('profile')}
        </Link>
      </div>
    </nav>
  )
}
