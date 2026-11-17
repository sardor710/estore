'use client'

// Minimal typing of the parts of Telegram.WebApp (https://core.telegram.org/bots/webapps) the shop uses.
// The script is https://telegram.org/js/telegram-web-app.js; outside Telegram `initData` is an empty string.

type Btn = {
  show(): void
  hide(): void
  onClick(cb: () => void): void
  offClick(cb: () => void): void
}
type MainBtn = Btn & {
  setText(t: string): void
  enable(): void
  disable(): void
  showProgress(leaveActive?: boolean): void
  hideProgress(): void
  isVisible: boolean
}
type LocationData = { latitude: number; longitude: number }
export type TgWebApp = {
  initData: string
  version: string
  platform: string
  ready(): void
  expand(): void
  isVersionAtLeast(v: string): boolean
  setHeaderColor(c: string): void
  setBackgroundColor(c: string): void
  openLink(url: string): void
  openTelegramLink(url: string): void
  requestContact?(cb?: (shared: boolean) => void): void
  BackButton: Btn
  MainButton: MainBtn
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void; notificationOccurred(t: 'error' | 'success' | 'warning'): void }
  LocationManager?: {
    isInited: boolean
    isLocationAvailable: boolean
    init(cb?: () => void): void
    getLocation(cb: (data: LocationData | null) => void): void
  }
}

export const TG_SCRIPT_SRC = 'https://telegram.org/js/telegram-web-app.js'

/** The WebApp object when running inside Telegram (non-empty initData), else null. */
export function getWebApp(): TgWebApp | null {
  if (typeof window === 'undefined') return null
  const w = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp
  return w && typeof w.initData === 'string' && w.initData ? w : null
}

let loading: Promise<TgWebApp | null> | null = null

/** Loads the Telegram script once (a no-op if already present) and resolves the WebApp object or null. */
export function loadWebApp(): Promise<TgWebApp | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  const ready = getWebApp()
  if (ready) return Promise.resolve(ready)
  if (!loading) {
    const attempt: Promise<TgWebApp | null> = new Promise((resolve) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${TG_SCRIPT_SRC}"]`)
      const s = existing ?? document.createElement('script')
      const done = () => resolve(getWebApp())
      s.addEventListener('load', done, { once: true })
      s.addEventListener('error', () => resolve(null), { once: true })
      if (!existing) {
        s.src = TG_SCRIPT_SRC
        s.async = true
        document.head.appendChild(s)
      } else if ((window as unknown as { Telegram?: unknown }).Telegram) {
        done()
      }
      setTimeout(done, 8000) // never hang the page if Telegram's CDN is slow
    })
    loading = attempt.then((app) => {
      if (!app) loading = null // not cached: a later call retries
      return app
    })
  }
  return loading
}
