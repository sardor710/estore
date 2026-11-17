import { cache } from 'react'
import { cookies } from 'next/headers'
import { forbidden, redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { SESSION_COOKIE, readSession } from '@/lib/auth'
import { can, isRole, type Permission, type Role } from '@/lib/permissions'

export type Staff = { id: number; email: string; name: string; role: Role }

/**
 * Token -> current staff member. The DB row is the authority: a disabled user, a role change or a bumped
 * sessionVersion (password reset, disable) takes effect on the very next request.
 */
export async function staffFromToken(token: string | null | undefined): Promise<Staff | null> {
  const claims = await readSession(token)
  if (!claims) return null
  const u = await prisma.adminUser.findUnique({ where: { id: claims.uid } })
  if (!u || !u.active || u.sessionVersion !== claims.sv || !isRole(u.role)) return null
  return { id: u.id, email: u.email, name: u.name, role: u.role }
}

/** Current staff member from the session cookie (memoised per request render). */
export const getStaff = cache(async (): Promise<Staff | null> => staffFromToken((await cookies()).get(SESSION_COOKIE)?.value))

/** Call at the top of every admin page and server action: the proxy alone is not trusted. */
export async function requireStaff(): Promise<Staff> {
  const staff = await getStaff()
  if (!staff) redirect('/admin/login')
  return staff
}

/** Authenticated AND authorised; renders the 403 page (forbidden.tsx) otherwise. */
export async function requirePermission(p: Permission): Promise<Staff> {
  const staff = await requireStaff()
  if (!can(staff.role, p)) forbidden()
  return staff
}
