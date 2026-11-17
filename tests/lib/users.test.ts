import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import { changeOwnPassword, createUser, ensureBootstrapAdmin, resetPassword, updateUser, LAST_ADMIN_ERROR } from '@/lib/admin/users'
import { verifyPassword } from '@/lib/password'
import type { Staff } from '@/lib/admin/session'

const system: Staff = { id: 0, email: 'system@test', name: 'System', role: 'ADMIN' }
const staffOf = (u: { id: number; email: string; name: string; role: string }) => ({ ...u, role: u.role }) as Staff

describe('ensureBootstrapAdmin', () => {
  it('creates a full admin only when the table is empty; the second call returns null', async () => {
    const first = await ensureBootstrapAdmin('Owner', 'correct horse battery')
    expect(first).toMatchObject({ email: 'owner', name: 'Owner', role: 'ADMIN', active: true })
    expect(await verifyPassword('correct horse battery', first!.passwordHash)).toBe(true)
    expect(await ensureBootstrapAdmin('someone-else', 'another long password')).toBeNull()
    expect(await prisma.adminUser.count()).toBe(1)
  })
  it('does nothing when any user already exists', async () => {
    await createUser({ email: 'pm@shop.uz', name: 'PM', role: 'PRODUCT_MANAGER', password: 'pm password 123' }, system)
    expect(await ensureBootstrapAdmin('owner', 'correct horse battery')).toBeNull()
  })
})

describe('createUser', () => {
  it('creates a user with a hashed password and logs it', async () => {
    const r = await createUser({ email: ' Editor@Shop.UZ ', name: 'Ed', role: 'BLOG_EDITOR', password: 'blog password 1' }, system)
    expect(r).toEqual({ ok: true })
    const u = await prisma.adminUser.findUniqueOrThrow({ where: { email: 'editor@shop.uz' } })
    expect(u.role).toBe('BLOG_EDITOR')
    expect(u.passwordHash).not.toContain('blog password 1')
    expect(await prisma.activityLog.count({ where: { entity: 'user', action: 'create', entityId: String(u.id) } })).toBe(1)
  })
  it('refuses a duplicate email (case-insensitive)', async () => {
    await createUser({ email: 'a@shop.uz', name: 'A', role: 'BLOG_EDITOR', password: 'long password 1' }, system)
    const r = await createUser({ email: 'A@SHOP.UZ', name: 'A2', role: 'ADMIN', password: 'long password 2' }, system)
    expect(r.ok).toBe(false)
    expect(await prisma.adminUser.count()).toBe(1)
  })
  it('validates email, name, role and password length', async () => {
    const base = { email: 'x@shop.uz', name: 'X', role: 'BLOG_EDITOR' as const, password: 'long enough pw' }
    expect((await createUser({ ...base, email: 'not-an-email' }, system)).ok).toBe(false)
    expect((await createUser({ ...base, name: '  ' }, system)).ok).toBe(false)
    expect((await createUser({ ...base, role: 'ROOT' as never }, system)).ok).toBe(false)
    expect((await createUser({ ...base, password: 'short' }, system)).ok).toBe(false)
    expect(await prisma.adminUser.count()).toBe(0)
  })
})

describe('updateUser: last active full admin is protected', () => {
  async function setup() {
    const admin = (await ensureBootstrapAdmin('owner@shop.uz', 'correct horse battery'))!
    return admin
  }
  it('refuses to disable the last active ADMIN', async () => {
    const admin = await setup()
    const r = await updateUser(admin.id, { active: false }, system)
    expect(r).toEqual({ ok: false, error: LAST_ADMIN_ERROR })
    expect(LAST_ADMIN_ERROR).toBe('At least one active full admin is required.')
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } })).active).toBe(true)
  })
  it('refuses to demote the last active ADMIN', async () => {
    const admin = await setup()
    expect(await updateUser(admin.id, { role: 'BLOG_EDITOR' }, system)).toEqual({ ok: false, error: LAST_ADMIN_ERROR })
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe('ADMIN')
  })
  it('an inactive second admin does not count', async () => {
    const admin = await setup()
    await createUser({ email: 'b@shop.uz', name: 'B', role: 'ADMIN', password: 'long password 2' }, system)
    const b = await prisma.adminUser.findUniqueOrThrow({ where: { email: 'b@shop.uz' } })
    expect(await updateUser(b.id, { active: false }, staffOf(admin))).toEqual({ ok: true })
    expect((await updateUser(admin.id, { active: false }, staffOf(b))).ok).toBe(false)
  })
  it('with two active admins, one may be demoted by the other, but nobody can demote or disable themselves', async () => {
    const admin = await setup()
    await createUser({ email: 'b@shop.uz', name: 'B', role: 'ADMIN', password: 'long password 2' }, system)
    const b = await prisma.adminUser.findUniqueOrThrow({ where: { email: 'b@shop.uz' } })
    const self = await updateUser(admin.id, { active: false }, staffOf(admin))
    expect(self.ok).toBe(false)
    expect((self as { error: string }).error).toMatch(/your own account/)
    expect((await updateUser(admin.id, { role: 'PRODUCT_MANAGER' }, staffOf(admin))).ok).toBe(false)
    expect(await updateUser(b.id, { role: 'PRODUCT_MANAGER' }, staffOf(admin))).toEqual({ ok: true })
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: b.id } })).role).toBe('PRODUCT_MANAGER')
  })
  it('renaming yourself is fine; disabling bumps sessionVersion; unknown id and bad role fail', async () => {
    const admin = await setup()
    expect(await updateUser(admin.id, { name: 'Boss' }, staffOf(admin))).toEqual({ ok: true })
    await createUser({ email: 'pm@shop.uz', name: 'PM', role: 'PRODUCT_MANAGER', password: 'long password 3' }, system)
    const pm = await prisma.adminUser.findUniqueOrThrow({ where: { email: 'pm@shop.uz' } })
    expect(await updateUser(pm.id, { active: false }, staffOf(admin))).toEqual({ ok: true })
    const after = await prisma.adminUser.findUniqueOrThrow({ where: { id: pm.id } })
    expect(after.active).toBe(false)
    expect(after.sessionVersion).toBe(pm.sessionVersion + 1)
    expect((await updateUser(99999, { name: 'x' }, staffOf(admin))).ok).toBe(false)
    expect((await updateUser(pm.id, { role: 'ROOT' as never }, staffOf(admin))).ok).toBe(false)
    expect(await prisma.activityLog.count({ where: { entity: 'user', action: 'update' } })).toBe(2)
  })
})

describe('resetPassword', () => {
  it('replaces the hash and increments sessionVersion', async () => {
    const admin = (await ensureBootstrapAdmin('owner@shop.uz', 'correct horse battery'))!
    const r = await resetPassword(admin.id, 'brand new password', system)
    expect(r).toEqual({ ok: true })
    const u = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } })
    expect(u.sessionVersion).toBe(admin.sessionVersion + 1)
    expect(await verifyPassword('brand new password', u.passwordHash)).toBe(true)
    expect(await verifyPassword('correct horse battery', u.passwordHash)).toBe(false)
  })
  it('rejects short passwords and unknown users', async () => {
    const admin = (await ensureBootstrapAdmin('owner@shop.uz', 'correct horse battery'))!
    expect((await resetPassword(admin.id, 'short', system)).ok).toBe(false)
    expect((await resetPassword(424242, 'long enough password', system)).ok).toBe(false)
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } })).sessionVersion).toBe(0)
  })
})

describe('changeOwnPassword', () => {
  async function editor() {
    await createUser({ email: 'ed@shop.uz', name: 'Ed', role: 'BLOG_EDITOR', password: 'old password 12' }, system)
    const u = await prisma.adminUser.findUniqueOrThrow({ where: { email: 'ed@shop.uz' } })
    return { u, me: staffOf(u) }
  }
  it('wrong current password -> {ok:false}; nothing changes', async () => {
    const { u, me } = await editor()
    const r = await changeOwnPassword(me, { current: 'not my password', password: 'new password 12', confirm: 'new password 12' })
    expect(r).toEqual({ ok: false, error: 'Current password is wrong.' })
    const after = await prisma.adminUser.findUniqueOrThrow({ where: { id: u.id } })
    expect(after.sessionVersion).toBe(u.sessionVersion)
    expect(await verifyPassword('old password 12', after.passwordHash)).toBe(true)
  })
  it('success -> new password verifies, sessionVersion + 1, activity logged', async () => {
    const { u, me } = await editor()
    expect(await changeOwnPassword(me, { current: 'old password 12', password: 'new password 12', confirm: 'new password 12' })).toEqual({ ok: true })
    const after = await prisma.adminUser.findUniqueOrThrow({ where: { id: u.id } })
    expect(await verifyPassword('new password 12', after.passwordHash)).toBe(true)
    expect(await verifyPassword('old password 12', after.passwordHash)).toBe(false)
    expect(after.sessionVersion).toBe(u.sessionVersion + 1)
    expect(await prisma.activityLog.count({ where: { action: 'update', entity: 'user', userId: u.id } })).toBe(1)
  })
  it('rejects short, mismatched or unchanged new passwords', async () => {
    const { me } = await editor()
    expect((await changeOwnPassword(me, { current: 'old password 12', password: 'short', confirm: 'short' })).ok).toBe(false)
    expect((await changeOwnPassword(me, { current: 'old password 12', password: 'new password 12', confirm: 'new password 13' })).ok).toBe(false)
    expect((await changeOwnPassword(me, { current: 'old password 12', password: 'old password 12', confirm: 'old password 12' })).ok).toBe(false)
  })
})
