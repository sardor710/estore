import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import '../globals.css'

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s | Admin' },
  robots: { index: false, follow: false, nocache: true },
}

// Admin is always rendered per request (cookies / live data).
export const dynamic = 'force-dynamic'

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Montserrat:wght@400;500;600;700;800;900&display=swap"
        />
      </head>
      <body className="min-h-screen bg-neutral-50">{children}</body>
    </html>
  )
}
