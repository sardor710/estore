import { NextResponse, type NextRequest } from 'next/server'
import { attemptLogin } from '@/lib/admin/login'
import { isSameOrigin } from '@/lib/admin/csrf'
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/auth'
import { homeFor } from '@/lib/permissions'
import { clientKey } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req.headers, req.method)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null
  const r = await attemptLogin({
    email: typeof body?.email === 'string' ? body.email : '',
    password: typeof body?.password === 'string' ? body.password : '',
    ip: clientKey(req.headers),
  })
  if (r.status === 503) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  if (r.status === 429) return NextResponse.json({ error: 'too_many_attempts' }, { status: 429, headers: { 'retry-after': '60' } })
  if (r.status === 401) return NextResponse.json({ error: 'invalid' }, { status: 401 })
  const res = NextResponse.json({ ok: true, home: homeFor(r.role) })
  res.cookies.set(SESSION_COOKIE, r.token, SESSION_COOKIE_OPTIONS)
  return res
}
