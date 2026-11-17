import { NextResponse, type NextRequest } from 'next/server'
import { isSameOrigin } from '@/lib/admin/csrf'
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req.headers, req.method)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 })
  return res
}
