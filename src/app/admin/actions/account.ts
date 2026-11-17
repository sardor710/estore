'use server'

import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth'
import { requireStaff } from '@/lib/admin/session'
import { changeOwnPassword, type UserResult } from '@/lib/admin/users'

/** Any signed-in staff member, for their own account only (the id comes from the session, never the client). */
export async function changeOwnPasswordAction(input: { current: string; password: string; confirm: string }): Promise<UserResult> {
  const staff = await requireStaff()
  const r = await changeOwnPassword(staff, {
    current: String(input?.current ?? ''),
    password: String(input?.password ?? ''),
    confirm: String(input?.confirm ?? ''),
  })
  if (!r.ok) return r
  // sessionVersion was bumped (other sessions signed out); keep this browser signed in with a fresh token.
  const u = await prisma.adminUser.findUniqueOrThrow({ where: { id: staff.id } })
  ;(await cookies()).set(SESSION_COOKIE, await createSession({ uid: u.id, role: staff.role, sv: u.sessionVersion }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
  return r
}
