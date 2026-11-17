import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', '@prisma/adapter-better-sqlite3'],
  // Enables forbidden() (role checks in admin pages and server actions) and the app/admin/forbidden.tsx UI.
  experimental: { authInterrupts: true },
}

export default withNextIntl(nextConfig)
