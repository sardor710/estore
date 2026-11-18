import type { ReactNode } from 'react'
import { getNavCategories } from '@/lib/catalog'
import { getAccountCustomer } from '@/lib/account/session'
import { favoriteIds } from '@/lib/account/favorites'
import type { Locale } from '@/i18n/routing'
import FavoritesProvider from '@/components/account/FavoritesProvider'
import Navbar from './Navbar'
import Footer from './Footer'
import CartDrawer from './CartDrawer'
import { isTelegramMode } from '@/lib/tg/mode'
import TabBar from '@/components/tg/TabBar'
import TgTopBar from '@/components/tg/TgTopBar'
import TgBridge from '@/components/tg/TgBridge'

/** Header + footer chrome shared by every storefront page; inside the Telegram Mini App, a top bar + bottom tab bar. */
export default async function StoreShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  // Storefront pages are force-dynamic, so reading the customer cookie here costs no static rendering.
  const [categories, customer, telegram] = await Promise.all([getNavCategories(), getAccountCustomer(), isTelegramMode()])
  const favorites = customer ? await favoriteIds(customer.id) : []
  if (telegram) {
    return (
      <FavoritesProvider ids={favorites} signedIn={customer !== null}>
        <TgTopBar locale={locale} />
        <main className="pb-[calc(4.5rem+env(safe-area-inset-bottom))]">{children}</main>
        <TabBar locale={locale} />
        <CartDrawer locale={locale} telegram />
        <TgBridge locale={locale} />
      </FavoritesProvider>
    )
  }
  return (
    <FavoritesProvider ids={favorites} signedIn={customer !== null}>
      <Navbar locale={locale} categories={categories} account={customer ? { name: customer.name, phone: customer.phone } : null} />
      <main>{children}</main>
      <Footer locale={locale} categories={categories} />
      <CartDrawer locale={locale} />
    </FavoritesProvider>
  )
}
