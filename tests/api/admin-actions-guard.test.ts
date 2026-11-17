import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { createSession, SESSION_COOKIE } from '@/lib/auth'
import type { Role } from '@/lib/permissions'

// Server actions are called directly with a mocked request cookie jar: this is what a crafted POST to the
// action endpoint would hit, regardless of what the menu shows.
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { publishAction, saveSettingsAction, setOrderStatusAction, testTelegramAction, saveUiAction } = await import('@/app/admin/actions')
const { createUserAction, resetPasswordAction, updateUserAction } = await import('@/app/admin/actions/users')

const saved = { ...process.env }
beforeEach(() => {
  process.env.SESSION_SECRET = 'z'.repeat(40)
  // next.config.ts sets this for the app (experimental.authInterrupts); forbidden() refuses to run without it.
  process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = 'true'
  jar.clear()
})
afterEach(() => {
  process.env = { ...saved }
})

let seq = 0
async function signIn(role: Role, opts: { active?: boolean } = {}) {
  const u = await prisma.adminUser.create({
    data: { email: `${role.toLowerCase()}-${++seq}@shop.uz`, name: role, role, active: opts.active ?? true, passwordHash: 'x' },
  })
  jar.set(SESSION_COOKIE, await createSession({ uid: u.id, role, sv: u.sessionVersion }))
  return u
}

const FORBIDDEN = { digest: 'NEXT_HTTP_ERROR_FALLBACK;403' }
const REDIRECT = { digest: expect.stringMatching(/^NEXT_REDIRECT;.*\/admin\/login/) }

describe('server actions enforce permissions server-side', () => {
  it('no session -> redirect to login, nothing runs', async () => {
    await expect(publishAction(1, true)).rejects.toMatchObject(REDIRECT)
    await expect(createUserAction({ email: 'a@b.uz', name: 'A', role: 'ADMIN', password: 'long password 1' })).rejects.toMatchObject(REDIRECT)
    expect(await prisma.adminUser.count()).toBe(0)
  })
  it('disabled account -> treated as signed out', async () => {
    await signIn('ADMIN', { active: false })
    await expect(publishAction(1, true)).rejects.toMatchObject(REDIRECT)
  })
  it('blog editor -> 403 on product, order, translation and settings actions', async () => {
    await signIn('BLOG_EDITOR')
    await expect(publishAction(1, true)).rejects.toMatchObject(FORBIDDEN)
    await expect(setOrderStatusAction(1, 'CONFIRMED')).rejects.toMatchObject(FORBIDDEN)
    await expect(saveUiAction([])).rejects.toMatchObject(FORBIDDEN)
    await expect(saveSettingsAction({ minOrderUzs: 1 })).rejects.toMatchObject(FORBIDDEN)
  })
  it('product manager -> 403 on user management and the Telegram test; integration fields refused', async () => {
    const pm = await signIn('PRODUCT_MANAGER')
    await expect(createUserAction({ email: 'x@shop.uz', name: 'X', role: 'ADMIN', password: 'long password 1' })).rejects.toMatchObject(FORBIDDEN)
    await expect(updateUserAction(pm.id, { role: 'ADMIN' })).rejects.toMatchObject(FORBIDDEN)
    await expect(resetPasswordAction(pm.id, 'long password 1')).rejects.toMatchObject(FORBIDDEN)
    await expect(testTelegramAction()).rejects.toMatchObject(FORBIDDEN)
    expect(await saveSettingsAction({ minOrderUzs: 1, telegramChatId: '-100' })).toMatchObject({ ok: false, errors: { _: expect.any(String) } })
    expect(await saveSettingsAction({ minOrderUzs: 50_000, lowStockThreshold: 4 })).toMatchObject({ ok: true })
    const log = await prisma.activityLog.findFirstOrThrow({ where: { entity: 'settings' } })
    expect(log).toMatchObject({ userId: pm.id, action: 'update' })
    expect(log.summary).toContain('minOrderUzs')
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: pm.id } })).role).toBe('PRODUCT_MANAGER')
  })
  it('full admin manages users; each change is logged; own password reset keeps this browser signed in', async () => {
    const admin = await signIn('ADMIN')
    expect(await createUserAction({ email: 'ed@shop.uz', name: 'Ed', role: 'BLOG_EDITOR', password: 'blog password 1' })).toEqual({ ok: true })
    const ed = await prisma.adminUser.findUniqueOrThrow({ where: { email: 'ed@shop.uz' } })
    expect(await updateUserAction(ed.id, { active: false })).toEqual({ ok: true })
    expect(await updateUserAction(admin.id, { active: false })).toMatchObject({ ok: false })
    expect(await updateUserAction(ed.id, { role: 'ROOT' as never })).toEqual({ ok: false, error: 'Unknown role.' })
    expect(await prisma.activityLog.count({ where: { entity: 'user', userId: admin.id } })).toBe(2)

    const before = jar.get(SESSION_COOKIE)
    expect(await resetPasswordAction(admin.id, 'my new long password')).toEqual({ ok: true })
    expect(jar.get(SESSION_COOKIE)).not.toBe(before)
    // The re-issued cookie is valid for the bumped sessionVersion: further actions still work.
    expect(await updateUserAction(ed.id, { active: true })).toEqual({ ok: true })
  })
})
