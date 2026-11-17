'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Cookie-less page-view beacon. Fire-and-forget after paint (effect + sendBeacon): never blocks rendering
 * and never throws into the page. Skipped for automated browsers.
 */
export default function TrackPageView() {
  const pathname = usePathname()
  const last = useRef<string | null>(null)

  useEffect(() => {
    if (last.current === pathname) return // React strict-mode double effect
    const first = last.current === null
    last.current = pathname
    try {
      if (typeof navigator === 'undefined' || navigator.webdriver || typeof navigator.sendBeacon !== 'function') return
      const body = JSON.stringify({
        path: pathname,
        locale: pathname.split('/')[1] ?? '',
        // Only the landing view has an external referrer; later navigations are internal.
        referrer: first ? document.referrer : '',
      })
      // text/plain keeps this a "simple" request (no CORS preflight); the route parses the text as JSON.
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'text/plain' }))
    } catch {
      // analytics must never affect the page
    }
  }, [pathname])

  return null
}
