import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { routing } from '@/i18n/routing'
import { SESSION_COOKIE, readSession } from '@/lib/auth'

const intl = createMiddleware(routing)

const OPEN = new Set(['/admin/login', '/api/admin/login'])

// Edge gate: authentication only (signed, unexpired token). Authorisation and the disabled/sessionVersion
// checks need the DB, so every page (requirePermission) and API handler (adminApi) does them itself.
async function guard(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (OPEN.has(pathname.replace(/\/+$/, ''))) return NextResponse.next()
  if (await readSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next()
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.redirect(new URL('/admin/login', req.url))
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin/')) return guard(req)
  return intl(req)
}

export const config = {
  // [0]: public pages (next-intl). The rest: admin guard.
  matcher: ['/((?!api|admin|_next|_vercel|.*\\..*).*)', '/admin/:path*', '/api/admin/:path*'],
}
