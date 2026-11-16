import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/auth'
import { isSameOrigin } from './csrf'

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response> | Response

/** Wraps an /api/admin route handler: CSRF check for unsafe methods, then session re-verification. */
export function adminApi<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    if (!isSameOrigin(req.headers, req.method)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    if (!(await verifySession(req.cookies.get(SESSION_COOKIE)?.value))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    return handler(req, ctx)
  }
}
