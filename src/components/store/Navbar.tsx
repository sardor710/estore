'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronDown, Heart, LogOut, Menu, Package, Search, ShoppingBag, UserRound, X } from 'lucide-react'
import type { CategoryNode } from '@/lib/catalog'
import type { Locale } from '@/i18n/routing'
import { t as l10n } from '@/lib/localized'
import { path } from '@/lib/paths'
import { useCart, useCartDrawer } from '@/lib/cart/useCart'
import LangSwitcher from './LangSwitcher'
import AccountMenu, { type NavAccount } from '@/components/account/AccountMenu'
import { loginHref, signOut } from '@/components/account/signOut'

export default function Navbar({ locale, categories, account = null }: { locale: Locale; categories: CategoryNode[]; account?: NavAccount }) {
  const t = useTranslations('nav')
  const tStore = useTranslations('store')
  const router = useRouter()
  const { count } = useCart()
  const { setOpen: setCartOpen } = useCartDrawer()
  const [open, setOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [q, setQ] = useState('')
  const pathname = usePathname() || path(locale)
  const mobileItem = 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-base font-medium text-neutral-800 hover:bg-neutral-50'

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = q.trim()
    setSearchOpen(false)
    setOpen(false)
    router.push(`${path(locale, '/search')}${v ? `?q=${encodeURIComponent(v)}` : ''}`)
  }

  const searchForm = (idSuffix: string) => (
    <form onSubmit={submit} role="search" className="flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2">
      <Search size={16} className="shrink-0 text-neutral-400" aria-hidden />
      <label htmlFor={`nav-search-${idSuffix}`} className="sr-only">
        {t('search')}
      </label>
      <input
        id={`nav-search-${idSuffix}`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('searchPlaceholder')}
        className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
      />
    </form>
  )

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          className="-ml-2 rounded-full p-2 text-neutral-800 hover:bg-neutral-100 xl:hidden"
          aria-label={open ? t('closeMenu') : t('openMenu')}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>

        <Link href={path(locale)} aria-label={t('toHome')} className="font-[family-name:var(--font-heading)] text-lg font-extrabold tracking-tight text-neutral-900">
          {tStore('name')}
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden w-64 2xl:block">{searchForm('desktop')}</div>
          <button
            type="button"
            className="rounded-full p-2 text-neutral-800 hover:bg-neutral-100 2xl:hidden"
            aria-label={t('search')}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Search size={19} />
          </button>
          <div className="hidden sm:block">
            <Suspense fallback={null}>
              <LangSwitcher locale={locale} />
            </Suspense>
          </div>
          {/* Below sm the account entries live in the menu panel (keeps the shop name on one line at 390px). */}
          <div className="hidden sm:block">
            <AccountMenu locale={locale} account={account} />
          </div>
          <button
            type="button"
            className="relative rounded-full p-2 text-neutral-800 hover:bg-neutral-100"
            aria-label={`${t('cart')} (${count})`}
            onClick={() => setCartOpen(true)}
          >
            <ShoppingBag size={20} />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral-900 px-1 text-[10px] font-bold text-white">
                {count}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Desktop categories: own row (uz/ru labels are far wider than the top bar), wraps instead of overflowing the page. */}
      <div className="hidden border-t border-neutral-100 xl:block">
        <nav aria-label={t('mainNav')} className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-1 px-4 py-1 sm:px-6 lg:px-8">
          {categories.map((c) => (
            <div key={c.id} className="group relative">
              <Link
                href={path(locale, `/c/${c.slug}`)}
                className="flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-900"
              >
                {l10n(c.name, locale)}
                {c.children.length > 0 && <ChevronDown size={13} className="text-neutral-400" aria-hidden />}
              </Link>
              {c.children.length > 0 && (
                <div className="invisible absolute left-0 top-full min-w-56 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  <ul className="rounded-xl border border-neutral-100 bg-white p-2 shadow-lg">
                    {c.children.map((ch) => (
                      <li key={ch.id}>
                        <Link
                          href={path(locale, `/c/${ch.slug}`)}
                          className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900"
                        >
                          {l10n(ch.name, locale)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          <Link
            href={path(locale, '/sale')}
            className="rounded-full px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            {t('sale')}
          </Link>
          <Link
            href={path(locale, '/blog')}
            className="rounded-full px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-900"
          >
            {t('blog')}
          </Link>
        </nav>
      </div>

      {searchOpen && <div className="border-t border-neutral-100 px-4 py-3 2xl:hidden">{searchForm('mobile')}</div>}

      {open && (
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-neutral-100 bg-white px-4 py-4 xl:hidden">
          <nav aria-label={t('mainNav')} className="space-y-1">
            {categories.map((c) => (
              <div key={c.id}>
                <Link
                  href={path(locale, `/c/${c.slug}`)}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-base font-semibold text-neutral-900 hover:bg-neutral-50"
                >
                  {l10n(c.name, locale)}
                </Link>
                {c.children.map((ch) => (
                  <Link
                    key={ch.id}
                    href={path(locale, `/c/${ch.slug}`)}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg py-2 pl-8 pr-3 text-sm text-neutral-600 hover:bg-neutral-50"
                  >
                    {l10n(ch.name, locale)}
                  </Link>
                ))}
              </div>
            ))}
            <Link
              href={path(locale, '/sale')}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-base font-semibold text-red-600 hover:bg-red-50"
            >
              {t('sale')}
            </Link>
            <Link
              href={path(locale, '/blog')}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-base font-semibold text-neutral-900 hover:bg-neutral-50"
            >
              {t('blog')}
            </Link>
          </nav>
          <nav aria-label={t('account')} className="mt-4 space-y-1 border-t border-neutral-100 pt-4">
            {account ? (
              <>
                <Link href={path(locale, '/account')} onClick={() => setOpen(false)} className={mobileItem}>
                  <UserRound size={18} aria-hidden className="text-neutral-400" />
                  {t('myAccount')}
                </Link>
                <Link href={path(locale, '/account/orders')} onClick={() => setOpen(false)} className={mobileItem}>
                  <Package size={18} aria-hidden className="text-neutral-400" />
                  {t('orders')}
                </Link>
                <Link href={path(locale, '/account/favorites')} onClick={() => setOpen(false)} className={mobileItem}>
                  <Heart size={18} aria-hidden className="text-neutral-400" />
                  {t('favorites')}
                </Link>
                <button type="button" onClick={() => void signOut(locale)} className={mobileItem}>
                  <LogOut size={18} aria-hidden className="text-neutral-400" />
                  {t('signOut')}
                </button>
              </>
            ) : (
              <Link
                href={pathname.startsWith(path(locale, '/login')) ? path(locale, '/login') : loginHref(locale, pathname)}
                onClick={() => setOpen(false)}
                className={mobileItem}
              >
                <UserRound size={18} aria-hidden className="text-neutral-400" />
                {t('signIn')}
              </Link>
            )}
          </nav>
          <div className="mt-4 sm:hidden">
            <Suspense fallback={null}>
              <LangSwitcher locale={locale} />
            </Suspense>
          </div>
        </div>
      )}
    </header>
  )
}
