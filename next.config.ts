import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', '@prisma/adapter-better-sqlite3'],
  // Enables forbidden() (role checks in admin pages and server actions) and the app/admin/forbidden.tsx UI.
  // proxyClientMaxBodySize: the proxy buffers request bodies (default 10 MB); message videos go up to 50 MB.
  experimental: { authInterrupts: true, proxyClientMaxBodySize: '52mb' },
}

export default withNextIntl(nextConfig)
