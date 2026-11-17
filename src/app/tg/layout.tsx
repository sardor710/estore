import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Shop',
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 }

export const dynamic = 'force-dynamic'

/** Telegram Mini App launch page: lives outside `[locale]` (see src/proxy.ts matcher). */
export default function TgLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uz">
      <head>
        {/* Loaded before hydration so Telegram.WebApp.initData is ready for the launcher. */}
        <script src="https://telegram.org/js/telegram-web-app.js" />
      </head>
      <body className="min-h-screen bg-white">{children}</body>
    </html>
  )
}
