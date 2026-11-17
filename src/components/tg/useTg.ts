'use client'

import { useEffect, useRef, useState } from 'react'
import { getWebApp, loadWebApp, type TgWebApp } from './webapp'

/** The Telegram WebApp object once its script has loaded (null outside Telegram). */
export function useWebApp(): TgWebApp | null {
  const [app, setApp] = useState<TgWebApp | null>(() => getWebApp())
  useEffect(() => {
    let alive = true
    if (!app) loadWebApp().then((a) => alive && setApp(a))
    return () => {
      alive = false
    }
  }, [app])
  return app
}

/**
 * Telegram's big bottom MainButton. `text` null hides it. The latest `onClick` is always used (kept in a ref), so
 * callers can pass inline closures without re-registering the Telegram handler on every render.
 */
export function useTgMainButton(text: string | null, onClick: () => void, opts: { disabled?: boolean; progress?: boolean } = {}): boolean {
  const app = useWebApp()
  const cb = useRef(onClick)
  cb.current = onClick
  useEffect(() => {
    if (!app) return
    const mb = app.MainButton
    const handler = () => cb.current()
    if (!text) {
      mb.hide()
      return
    }
    mb.setText(text)
    mb.onClick(handler)
    mb.show()
    return () => {
      mb.offClick(handler)
      mb.hide()
    }
  }, [app, text])
  useEffect(() => {
    if (!app || !text) return
    const mb = app.MainButton
    if (opts.disabled) mb.disable()
    else mb.enable()
    if (opts.progress) mb.showProgress(false)
    else mb.hideProgress()
  }, [app, text, opts.disabled, opts.progress])
  // true only while Telegram's own button is on screen: callers hide their in-page button only then
  return app !== null && !!text
}
