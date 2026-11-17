'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth'
import { requirePermission } from '@/lib/admin/session'
import { createUser, resetPassword, updateUser, type UserResult } from '@/lib/admin/users'
import { isRole, type Role } from '@/lib/permissions'

// Full admins only ('users'); the lib functions validate input, protect the last active admin and log activity.

export async function createUserAction(input: { email: string; name: string; role: Role; password: string }): Promise<UserResult> {
  const staff = await requirePermission('users')
  const r = await createUser(
    { email: String(input?.email ?? ''), name: String(input?.name ?? ''), role: input?.role, password: String(input?.password ?? '') },
    staff,
  )
  if (r.ok) revalidatePath('/admin/users')
  return r
}

export async function updateUserAction(id: number, patch: { name?: string; role?: Role; active?: boolean }): Promise<UserResult> {
  const staff = await requirePermission('users')
  if (!Number.isInteger(id)) return { ok: false, error: 'User not found.' }
  const clean: { name?: string; role?: Role; active?: boolean } = {}
  if (typeof patch?.name === 'string') clean.name = patch.name
  if (patch?.role !== undefined) {
    if (!isRole(patch.role)) return { ok: false, error: 'Unknown role.' }
    clean.role = patch.role
  }
  if (typeof patch?.active === 'boolean') clean.active = patch.active
  const r = await updateUser(id, clean, staff)
  if (r.ok) revalidatePath('/admin/users')
  return r
}

export async function resetPasswordAction(id: number, password: string): Promise<UserResult> {
  const staff = await requirePermission('users')
  if (!Number.isInteger(id)) return { ok: false, error: 'User not found.' }
  const r = await resetPassword(id, String(password ?? ''), staff)
  if (!r.ok) return r
  // Resetting signs the user out everywhere (sessionVersion bump). For your own account, keep this browser signed in.
  if (id === staff.id) {
    const u = await prisma.adminUser.findUniqueOrThrow({ where: { id } })
    ;(await cookies()).set(SESSION_COOKIE, await createSession({ uid: u.id, role: staff.role, sv: u.sessionVersion }), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    })
  }
  revalidatePath('/admin/users')
  return r
}
