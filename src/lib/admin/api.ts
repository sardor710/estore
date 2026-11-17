import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth'
import { can, type Permission } from '@/lib/permissions'
import { isSameOrigin } from './csrf'
import { staffFromToken, type Staff } from './session'

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response> | Response
type StaffHandler<C> = (req: NextRequest, ctx: C, staff: Staff) => Promise<Response> | Response

/**
 * Wraps an /api/admin route handler: CSRF check for unsafe methods, session re-verification against the DB
 * (401), then the permission check (403; any one of `perm` suffices). The handler receives the staff member.
 */
export function adminApi<C = unknown>(perm: Permission | Permission[], handler: StaffHandler<C>): Handler<C> {
  const perms = Array.isArray(perm) ? perm : [perm]
  return async (req, ctx) => {
    if (!isSameOrigin(req.headers, req.method)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const staff = await staffFromToken(req.cookies.get(SESSION_COOKIE)?.value)
    if (!staff) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (!perms.some((p) => can(staff.role, p))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    return handler(req, ctx, staff)
  }
}
