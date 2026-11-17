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

const { saveSettingsAction, setOrderStatusAction, testTelegramAction, saveUiAction } = await import('@/app/admin/actions')
const { publishAction, saveProductAction, bulkProductsAction, updateVariantInlineAction, duplicateProductAction } = await import('@/app/admin/actions/products')
const { baselineOf } = await import('@/lib/admin/products')
const { createUserAction, resetPasswordAction, updateUserAction } = await import('@/app/admin/actions/users')
const { changeOwnPasswordAction } = await import('@/app/admin/actions/account')
const { savePromotionAction, togglePromotionAction, deletePromotionAction } = await import('@/app/admin/actions/promotions')
const { saveBrandAction, deleteBrandAction } = await import('@/app/admin/actions/brands')
const { updateCustomerAction } = await import('@/app/admin/actions/clients')
const { hashPassword } = await import('@/lib/password')

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
    await expect(bulkProductsAction([1], { type: 'delete' })).rejects.toMatchObject(FORBIDDEN)
    await expect(updateVariantInlineAction(1, { stock: 1 })).rejects.toMatchObject(FORBIDDEN)
    await expect(duplicateProductAction(1)).rejects.toMatchObject(FORBIDDEN)
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

  it('any role (blog editor) changes its own password; the cookie is re-issued and keeps working', async () => {
    const ed = await signIn('BLOG_EDITOR')
    await prisma.adminUser.update({ where: { id: ed.id }, data: { passwordHash: await hashPassword('old password 12') } })
    expect(await changeOwnPasswordAction({ current: 'wrong one here', password: 'new password 12', confirm: 'new password 12' })).toMatchObject({ ok: false })
    const before = jar.get(SESSION_COOKIE)
    expect(await changeOwnPasswordAction({ current: 'old password 12', password: 'new password 12', confirm: 'new password 12' })).toEqual({ ok: true })
    expect(jar.get(SESSION_COOKIE)).not.toBe(before)
    const { staffFromToken } = await import('@/lib/admin/session')
    expect(await staffFromToken(jar.get(SESSION_COOKIE))).toMatchObject({ id: ed.id, role: 'BLOG_EDITOR' })
    expect(await staffFromToken(before)).toBeNull()
  })
  it('no session -> account action redirects to login', async () => {
    await expect(changeOwnPasswordAction({ current: 'x', password: 'new password 12', confirm: 'new password 12' })).rejects.toMatchObject(REDIRECT)
  })

  it('promotion and brand actions: blog editor 403, product manager allowed and logged', async () => {
    await signIn('BLOG_EDITOR')
    const promo = { name: 'P', kind: 'PERCENT', value: 10, targetType: 'BRAND', targetIds: [1], enabled: true, startsAt: null, endsAt: null } as const
    await expect(savePromotionAction({ ...promo, targetIds: [1] })).rejects.toMatchObject(FORBIDDEN)
    await expect(togglePromotionAction(1, false)).rejects.toMatchObject(FORBIDDEN)
    await expect(deletePromotionAction(1)).rejects.toMatchObject(FORBIDDEN)
    await expect(saveBrandAction({ name: 'B', slug: '', logoUrl: '', sortOrder: 0 })).rejects.toMatchObject(FORBIDDEN)
    await expect(deleteBrandAction(1)).rejects.toMatchObject(FORBIDDEN)

    const pm = await signIn('PRODUCT_MANAGER')
    const b = await saveBrandAction({ name: 'Anker', slug: '', logoUrl: '', sortOrder: 0 })
    expect(b).toMatchObject({ ok: true })
    const brandId = (b as { id: number }).id
    const p = await savePromotionAction({ ...promo, targetIds: [brandId] })
    expect(p).toMatchObject({ ok: true })
    expect(await togglePromotionAction((p as { id: number }).id, false)).toEqual({ ok: true })
    expect(await prisma.activityLog.count({ where: { userId: pm.id, entity: { in: ['brand', 'promotion'] } } })).toBe(3)
  })

  it('client action: blog editor 403, product manager allowed and logged', async () => {
    const c = await prisma.customer.create({ data: { phone: '+998901234567', name: 'Ali', region: 'tashkent-city', tags: [] } })
    await signIn('BLOG_EDITOR')
    await expect(updateCustomerAction(c.id, { blocked: true })).rejects.toMatchObject(FORBIDDEN)
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).blocked).toBe(false)
    const pm = await signIn('PRODUCT_MANAGER')
    expect(await updateCustomerAction(c.id, { blocked: true, tags: ['wholesale'] })).toEqual({ ok: true })
    expect(await prisma.activityLog.findFirst({ where: { entity: 'customer', entityId: String(c.id) } })).toMatchObject({ userId: pm.id, action: 'update' })
  })

  it('product save is logged even when the spec labels that follow it fail', async () => {
    const pm = await signIn('PRODUCT_MANAGER')
    const cat = await prisma.category.create({ data: { slug: 'c', name: { en: 'c' } } })
    const p = await prisma.product.create({
      data: {
        slug: 'p1', categoryId: cat.id, title: { en: 'T' }, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [],
        inTheBox: [], faq: [], specs: [], images: ['https://img/a.jpg'], reviewed: { uz: false, ru: false },
        variants: { create: [{ sku: 'S1', name: { en: 'S1' }, priceUzs: 100, stock: 1 }] },
      },
      include: { variants: true },
    })
    const input = {
      slug: p.slug, categoryId: cat.id, templateOverride: null, brandId: null, badge: null,
      title: { en: 'Renamed' }, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [], inTheBox: [], faq: [], specs: [],
      images: ['https://img/a.jpg'], reviewed: { uz: false, ru: false }, seoTitle: {}, seoDescription: {},
      variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, name: { en: v.sku }, priceUzs: v.priceUzs, compareAtUzs: null, stock: v.stock, colorHex: null, imageIndex: null })),
    }
    // An empty spec key makes saveSpecLabels fail after updateProduct has already written the product.
    const r = await saveProductAction(p.id, input, { '  ': { en: 'x' } }, await baselineOf(p.id))
    expect(r).toMatchObject({ ok: false, errors: { specs: expect.any(String) } })
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).title).toEqual({ en: 'Renamed' })
    expect(await prisma.activityLog.findFirst({ where: { entity: 'product', entityId: String(p.id) } })).toMatchObject({ userId: pm.id, action: 'update' })
  })
})
