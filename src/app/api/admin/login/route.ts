import { NextResponse, type NextRequest } from 'next/server'
import { attemptLogin } from '@/lib/admin/login'
import { isSameOrigin } from '@/lib/admin/csrf'
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local'
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req.headers, req.method)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const body = (await req.json().catch(() => null)) as { user?: unknown; password?: unknown } | null
  const r = await attemptLogin({
    user: typeof body?.user === 'string' ? body.user : '',
    password: typeof body?.password === 'string' ? body.password : '',
    ip: clientIp(req),
  })
  if (r.status === 503) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  if (r.status === 429) return NextResponse.json({ error: 'too_many_attempts' }, { status: 429, headers: { 'retry-after': '60' } })
  if (r.status === 401) return NextResponse.json({ error: 'invalid' }, { status: 401 })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, r.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
  return res
}
