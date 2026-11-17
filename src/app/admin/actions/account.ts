'use server'

import { reissueSessionCookie, requireStaff } from '@/lib/admin/session'
import { changeOwnPassword, type UserResult } from '@/lib/admin/users'

/** Any signed-in staff member, for their own account only (the id comes from the session, never the client). */
export async function changeOwnPasswordAction(input: { current: string; password: string; confirm: string }): Promise<UserResult> {
  const staff = await requireStaff()
  const r = await changeOwnPassword(staff, {
    current: String(input?.current ?? ''),
    password: String(input?.password ?? ''),
    confirm: String(input?.confirm ?? ''),
  })
  // sessionVersion was bumped (other sessions signed out); keep this browser signed in with a fresh token.
  if (r.ok) await reissueSessionCookie(staff.id)
  return r
}
