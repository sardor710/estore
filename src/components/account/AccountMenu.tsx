'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Heart, LogOut, Package, UserRound } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { path } from '@/lib/paths'
import { initialOf } from './format'
import { loginHref, signOut } from './signOut'

export type NavAccount = { name: string } | null

/** Header account control: "Sign in" icon link when signed out, initial avatar + menu when signed in. */
export default function AccountMenu({ locale, account }: { locale: Locale; account: NavAccount }) {
  const t = useTranslations('nav')
  const pathname = usePathname() || path(locale)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  // Close on navigation (and when a preserved page is hidden).
  useLayoutEffect(() => () => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  if (!account) {
    const onLogin = pathname.startsWith(path(locale, '/login'))
    return (
      <Link
        href={onLogin ? path(locale, '/login') : loginHref(locale, pathname)}
        aria-label={t('signIn')}
        title={t('signIn')}
        className="rounded-full p-2 text-neutral-800 hover:bg-neutral-100"
      >
        <UserRound size={20} aria-hidden />
      </Link>
    )
  }

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = items()
    const i = list.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      list[(i + 1) % list.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      list[(i - 1 + list.length) % list.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      list[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      list[list.length - 1]?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  const initial = initialOf(account.name)
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-neutral-700 outline-none hover:bg-neutral-50 hover:text-neutral-900 focus-visible:bg-neutral-100 focus-visible:text-neutral-900'

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={t('accountMenu', { name: account.name })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className="flex rounded-full p-1 hover:bg-neutral-100"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white" aria-hidden>
          {initial ?? <UserRound size={15} />}
        </span>
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t('account')}
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-neutral-100 bg-white p-2 shadow-lg"
        >
          <p className="truncate px-3 pb-2 pt-1 text-xs text-neutral-500">{account.name}</p>
          <Link role="menuitem" tabIndex={-1} href={path(locale, '/account')} onClick={() => setOpen(false)} className={item}>
            <UserRound size={16} aria-hidden className="text-neutral-400" />
            {t('myAccount')}
          </Link>
          <Link role="menuitem" tabIndex={-1} href={path(locale, '/account/orders')} onClick={() => setOpen(false)} className={item}>
            <Package size={16} aria-hidden className="text-neutral-400" />
            {t('orders')}
          </Link>
          <Link role="menuitem" tabIndex={-1} href={path(locale, '/account/favorites')} onClick={() => setOpen(false)} className={item}>
            <Heart size={16} aria-hidden className="text-neutral-400" />
            {t('favorites')}
          </Link>
          <div className="my-1 border-t border-neutral-100" role="none" />
          <button
            role="menuitem"
            tabIndex={-1}
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              if (!(await signOut(locale))) setBusy(false)
            }}
            className={item}
          >
            <LogOut size={16} aria-hidden className="text-neutral-400" />
            {t('signOut')}
          </button>
        </div>
      )}
    </div>
  )
}
