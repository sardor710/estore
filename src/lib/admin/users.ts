import { prisma } from '@/lib/db'
import type { AdminUser } from '@/generated/prisma/client'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth'
import { hashPassword, verifyPassword } from '@/lib/password'
import { isRole, ROLE_LABELS, type Role } from '@/lib/permissions'
import { logActivity } from './activity'
import type { Staff } from './session'

export type UserResult = { ok: true } | { ok: false; error: string }

export const LAST_ADMIN_ERROR = 'At least one active full admin is required.'
const SELF_ERROR = 'You cannot disable or change the role of your own account.'
const MAX_PASSWORD_LENGTH = 200

const isUniqueViolation = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'

/** Login identifiers are case-insensitive. */
export function normalizeEmail(email: string): string {
  return (email ?? '').trim().toLowerCase()
}

function passwordError(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  if (pw.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`
  return null
}

function nameError(name: unknown): string | null {
  return typeof name !== 'string' || !name.trim() || name.trim().length > 100 ? 'Name is required (up to 100 characters).' : null
}

export type PublicUser = Omit<AdminUser, 'passwordHash'>

export async function listUsers(): Promise<PublicUser[]> {
  return prisma.adminUser.findMany({
    orderBy: [{ active: 'desc' }, { email: 'asc' }],
    omit: { passwordHash: true },
  })
}

/**
 * First full admin from the .env credentials. Only while the AdminUser table is empty; afterwards (or if a
 * concurrent login created it first) returns null. The identifier may be a plain username such as "admin".
 */
export async function ensureBootstrapAdmin(user: string, password: string): Promise<AdminUser | null> {
  if ((await prisma.adminUser.count()) > 0) return null
  const passwordHash = await hashPassword(password)
  try {
    return await prisma.$transaction(async (tx) => {
      if ((await tx.adminUser.count()) > 0) return null
      return tx.adminUser.create({ data: { email: normalizeEmail(user), name: user.trim(), role: 'ADMIN', passwordHash } })
    })
  } catch (e) {
    if (isUniqueViolation(e)) return null
    throw e
  }
}

export async function createUser(
  input: { email: string; name: string; role: Role; password: string },
  actor: Staff,
): Promise<UserResult> {
  const email = normalizeEmail(input.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { ok: false, error: 'Enter a valid email address.' }
  const nErr = nameError(input.name)
  if (nErr) return { ok: false, error: nErr }
  if (!isRole(input.role)) return { ok: false, error: 'Unknown role.' }
  const pErr = passwordError(input.password)
  if (pErr) return { ok: false, error: pErr }
  try {
    const u = await prisma.adminUser.create({
      data: { email, name: input.name.trim(), role: input.role, passwordHash: await hashPassword(input.password) },
    })
    await logActivity(actor, 'create', 'user', u.id, `Created ${ROLE_LABELS[input.role].toLowerCase()} ${email}`)
    return { ok: true }
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: 'A user with this email already exists.' }
    throw e
  }
}

class LastAdminError extends Error {}

export async function updateUser(
  id: number,
  patch: { name?: string; role?: Role; active?: boolean },
  actor: Staff,
): Promise<UserResult> {
  if (patch.role !== undefined && !isRole(patch.role)) return { ok: false, error: 'Unknown role.' }
  if (patch.name !== undefined) {
    const nErr = nameError(patch.name)
    if (nErr) return { ok: false, error: nErr }
  }
  const target = await prisma.adminUser.findUnique({ where: { id } })
  if (!target) return { ok: false, error: 'User not found.' }

  const roleChanges = patch.role !== undefined && patch.role !== target.role
  const disabling = patch.active === false && target.active
  const removesAdmin = target.role === 'ADMIN' && target.active && ((roleChanges && patch.role !== 'ADMIN') || disabling)

  if (removesAdmin) {
    const others = await prisma.adminUser.count({ where: { role: 'ADMIN', active: true, id: { not: id } } })
    if (others === 0) return { ok: false, error: LAST_ADMIN_ERROR }
  }
  if (actor.id === id && (roleChanges || disabling)) return { ok: false, error: SELF_ERROR }

  try {
    await prisma.$transaction(async (tx) => {
      // Write first, then re-check: SQLite serialises writers, so two concurrent demotions cannot both pass.
      await tx.adminUser.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
          ...(patch.role !== undefined ? { role: patch.role } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
          // A disabled account's existing sessions must not come back to life if it is re-enabled later.
          ...(disabling ? { sessionVersion: { increment: 1 } } : {}),
        },
      })
      if (removesAdmin && (await tx.adminUser.count({ where: { role: 'ADMIN', active: true } })) === 0) throw new LastAdminError()
    })
  } catch (e) {
    if (e instanceof LastAdminError) return { ok: false, error: LAST_ADMIN_ERROR }
    throw e
  }

  const changes: string[] = []
  if (patch.name !== undefined && patch.name.trim() !== target.name) changes.push(`name "${target.name}" -> "${patch.name.trim()}"`)
  if (roleChanges) changes.push(`role ${target.role} -> ${patch.role}`)
  if (patch.active !== undefined && patch.active !== target.active) changes.push(patch.active ? 'enabled' : 'disabled')
  if (changes.length) await logActivity(actor, 'update', 'user', id, `Updated ${target.email}: ${changes.join(', ')}`)
  return { ok: true }
}

/**
 * Self-service password change for any signed-in staff member: requires the current password, bumps
 * sessionVersion (other sessions are signed out). The caller re-issues its own cookie afterwards.
 */
export async function changeOwnPassword(
  actor: Staff,
  input: { current: string; password: string; confirm: string },
): Promise<UserResult> {
  const u = await prisma.adminUser.findUnique({ where: { id: actor.id } })
  if (!u || !u.active) return { ok: false, error: 'User not found.' }
  if (!(await verifyPassword(String(input?.current ?? ''), u.passwordHash))) return { ok: false, error: 'Current password is wrong.' }
  const pErr = passwordError(input.password)
  if (pErr) return { ok: false, error: pErr }
  if (input.password !== input.confirm) return { ok: false, error: 'The new passwords do not match.' }
  if (input.password === input.current) return { ok: false, error: 'Choose a password different from the current one.' }
  await prisma.adminUser.update({
    where: { id: u.id },
    data: { passwordHash: await hashPassword(input.password), sessionVersion: { increment: 1 } },
  })
  await logActivity(actor, 'update', 'AdminUser', u.id, `Changed own password (${u.email})`)
  return { ok: true }
}

/** Sets a new password and bumps sessionVersion, which signs the user out everywhere. */
export async function resetPassword(id: number, password: string, actor: Staff): Promise<UserResult> {
  const pErr = passwordError(password)
  if (pErr) return { ok: false, error: pErr }
  const target = await prisma.adminUser.findUnique({ where: { id }, select: { email: true } })
  if (!target) return { ok: false, error: 'User not found.' }
  await prisma.adminUser.update({
    where: { id },
    data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } },
  })
  await logActivity(actor, 'update', 'user', id, `Reset password for ${target.email}`)
  return { ok: true }
}
