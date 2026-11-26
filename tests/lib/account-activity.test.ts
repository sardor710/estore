import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import { LAST_SEEN_STEP_MS, lastSeenIsStale, markSignedIn, touchLastSeen } from '@/lib/account/activity'
import { deleteAccount } from '@/lib/account/profile'
import { linkTelegramContactDirect } from '@/lib/account/login'

const T0 = new Date('2026-12-05T08:00:00Z')
const at = (ms: number) => new Date(T0.getTime() + ms)

const mkAccount = (over: Record<string, unknown> = {}) =>
  prisma.customer.create({ data: { phone: '+998901234567', name: 'Aziz', region: 'samarkand', tags: [], telegramUserId: 'tg1', telegramChatId: '777', accountCreatedAt: T0, ...over } })
const times = async (id: number) => prisma.customer.findUnique({ where: { id }, select: { lastLoginAt: true, lastSeenAt: true } })

describe('touchLastSeen', () => {
  it('the step is 5 minutes', () => {
    expect(LAST_SEEN_STEP_MS).toBe(300_000)
  })
  it('writes on the first signed-in view', async () => {
    const c = await mkAccount()
    expect(await touchLastSeen(c.id, T0)).toBe(true)
    expect(await times(c.id)).toEqual({ lastLoginAt: null, lastSeenAt: T0 })
  })
  it('does not write again inside the step, and writes again once it has passed', async () => {
    const c = await mkAccount()
    await touchLastSeen(c.id, T0)
    expect(await touchLastSeen(c.id, at(LAST_SEEN_STEP_MS - 1000))).toBe(false)
    expect((await times(c.id))?.lastSeenAt).toEqual(T0)
    expect(await touchLastSeen(c.id, at(LAST_SEEN_STEP_MS + 1))).toBe(true)
    expect((await times(c.id))?.lastSeenAt).toEqual(at(LAST_SEEN_STEP_MS))
  })
  it('stores the start of the 5-minute slot, never the exact moment of the page view', async () => {
    // An exact time would equal PageView.createdAt and so tie the customer to that day's visitor hash.
    const c = await mkAccount()
    expect(await touchLastSeen(c.id, at(123_456))).toBe(true)
    expect((await times(c.id))?.lastSeenAt).toEqual(T0)
    expect(await touchLastSeen(c.id, at(7 * 60_000 + 42_001))).toBe(true)
    expect((await times(c.id))?.lastSeenAt).toEqual(at(5 * 60_000))
  })
  it('never moves last seen backwards after a sign-in in the same slot', async () => {
    const c = await mkAccount()
    await markSignedIn(c.id, at(60_000))
    expect(await touchLastSeen(c.id, at(120_000))).toBe(false)
    expect((await times(c.id))?.lastSeenAt).toEqual(at(60_000))
  })
  it('lastSeenIsStale: true for never seen or an earlier slot, false inside the current slot', () => {
    expect(lastSeenIsStale(null, T0)).toBe(true)
    expect(lastSeenIsStale(T0, at(LAST_SEEN_STEP_MS - 1))).toBe(false)
    expect(lastSeenIsStale(T0, at(LAST_SEEN_STEP_MS))).toBe(true)
  })
  it('a customer without an account is never stamped (a stamp racing an account deletion)', async () => {
    const c = await mkAccount({ accountCreatedAt: null, telegramUserId: null })
    expect(await touchLastSeen(c.id, T0)).toBe(false)
    await markSignedIn(c.id, T0)
    expect(await times(c.id)).toEqual({ lastLoginAt: null, lastSeenAt: null })
  })
  it('an unknown customer id writes nothing and does not throw', async () => {
    expect(await touchLastSeen(999_999, T0)).toBe(false)
  })
})

describe('markSignedIn', () => {
  it('sets last sign-in and last seen to the same moment', async () => {
    const c = await mkAccount()
    await markSignedIn(c.id, T0)
    expect(await times(c.id)).toEqual({ lastLoginAt: T0, lastSeenAt: T0 })
  })
})

describe('the times go when the account goes', () => {
  it('deleting an account that has orders clears both times', async () => {
    const c = await mkAccount()
    await markSignedIn(c.id, T0)
    await prisma.order.create({
      data: { number: 1, status: 'DELIVERED', name: 'Aziz', phone: c.phone, region: 'samarkand', address: 'x', locale: 'uz', totalUzs: 1000, lines: { create: [{ variantId: 1, sku: 'S1', productTitle: 'Phone', variantName: 'Black', priceUzs: 1000, qty: 1 }] } },
    })
    expect(await deleteAccount(c.id)).toBe(true)
    expect(await times(c.id)).toEqual({ lastLoginAt: null, lastSeenAt: null })
  })
  it('a Telegram user who links another phone leaves no times on the old account', async () => {
    const old = await mkAccount()
    await markSignedIn(old.id, T0)
    expect(await linkTelegramContactDirect({ telegramUserId: 'tg1', chatId: '777', contactUserId: 'tg1', phone: '+998907654321', name: 'Aziz' })).toBe('ok')
    expect(await prisma.customer.findUnique({ where: { id: old.id }, select: { accountCreatedAt: true, lastLoginAt: true, lastSeenAt: true } })).toEqual({ accountCreatedAt: null, lastLoginAt: null, lastSeenAt: null })
  })
  it('another Telegram user who takes over the phone number does not inherit the previous holder’s times', async () => {
    const c = await mkAccount()
    await markSignedIn(c.id, T0)
    expect(await linkTelegramContactDirect({ telegramUserId: 'tg2', chatId: '888', contactUserId: 'tg2', phone: c.phone, name: 'Bobur' })).toBe('ok')
    expect(await prisma.customer.findUnique({ where: { id: c.id }, select: { telegramUserId: true, lastLoginAt: true, lastSeenAt: true } })).toEqual({ telegramUserId: 'tg2', lastLoginAt: null, lastSeenAt: null })
  })
})
