'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Locale } from '@/i18n/routing'
import { useCart } from '@/lib/cart/useCart'
import { useWebApp } from './useTg'
import { loadWebApp } from './webapp'

/** Paths reached from the bottom tab bar: Telegram's BackButton is hidden there. */
export function tabRoots(locale: Locale): string[] {
  return [`/${locale}`, `/${locale}/c`, `/${locale}/account/orders`, `/${locale}/account`]
}

const SHOP_COLOR = '#ffffff'

/**
 * Glue between the storefront and the Telegram client (Telegram mode only): ready/expand + colours, the native
 * BackButton on non-tab pages, external links through openLink/openTelegramLink, a light haptic on add-to-cart.
 */
export default function TgBridge({ locale }: { locale: Locale }) {
  const app = useWebApp()
  const router = useRouter()
  const pathname = usePathname() || `/${locale}`
  const { count } = useCart()
  const lastCount = useRef<number | null>(null)

  // tg_mode cookie but no Telegram client (script failed, or a stale cookie in a normal / in-app browser):
  // drop Telegram mode instead of leaving the page without its Telegram buttons.
  useEffect(() => {
    let alive = true
    loadWebApp().then(async (a) => {
      if (!alive || a) return
      try {
        const res = await fetch('/api/tg/exit', { method: 'POST', credentials: 'same-origin' })
        // reload only once the cookie is gone: a failed call (offline) must not start a reload loop
        if (alive && res.ok) window.location.reload()
      } catch {
        // offline: stay on the page
      }
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!app) return
    app.ready()
    app.expand()
    try {
      app.setHeaderColor(SHOP_COLOR)
      app.setBackgroundColor(SHOP_COLOR)
    } catch {
      // older clients without colour APIs
    }
  }, [app])

  useEffect(() => {
    if (!app) return
    const bb = app.BackButton
    const isRoot = tabRoots(locale).includes(pathname.replace(/\/+$/, '') || '/')
    if (isRoot) {
      bb.hide()
      return
    }
    const back = () => {
      if (window.history.length > 1) router.back()
      else router.push(`/${locale}`)
    }
    bb.onClick(back)
    bb.show()
    return () => {
      bb.offClick(back)
    }
  }, [app, pathname, locale, router])

  useEffect(() => {
    if (!app) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      let url: URL
      try {
        url = new URL(a.href, window.location.href)
      } catch {
        return
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return
      if (url.origin === window.location.origin) return
      e.preventDefault()
      if (url.hostname === 't.me' || url.hostname === 'telegram.me') app.openTelegramLink(url.href)
      else app.openLink(url.href)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [app])

  useEffect(() => {
    if (lastCount.current !== null && count > lastCount.current) app?.HapticFeedback?.impactOccurred('light')
    lastCount.current = count
  }, [count, app])

  return null
}
