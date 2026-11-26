import { prisma } from '@/lib/db'
import { locales, type Locale } from '@/i18n/routing'

// Profile of a signed-in customer (scoped by the session's customer id). Only rows with an account
// (accountCreatedAt set) are changed.

export type ProfileInput = { name: string; locale: Locale; notifyTelegram: boolean }
export type ProfileResult = { ok: true } | { ok: false; error: 'INVALID' | 'NOT_FOUND' }

export async function updateProfile(cid: number, input: ProfileInput): Promise<ProfileResult> {
  const name = typeof input?.name === 'string' ? input.name.trim() : ''
  const locale = input?.locale
  if (name.length < 2 || name.length > 100 || !(locales as readonly string[]).includes(locale) || typeof input?.notifyTelegram !== 'boolean') {
    return { ok: false, error: 'INVALID' }
  }
  const r = await prisma.customer.updateMany({
    where: { id: cid, accountCreatedAt: { not: null } },
    data: { name, accountLocale: locale, notifyTelegram: input.notifyTelegram },
  })
  return r.count === 1 ? { ok: true } : { ok: false, error: 'NOT_FOUND' }
}

/** Revokes every session of this customer (all devices): bumps sessionVersion. False when there is no such customer. */
export async function signOutEverywhere(cid: number): Promise<boolean> {
  const r = await prisma.customer.updateMany({ where: { id: cid }, data: { sessionVersion: { increment: 1 } } })
  return r.count === 1
}

/**
 * Deletes the account: Telegram link, account fields, addresses, favorites, shop messages and sign-in rows (the customer's and
 * those bound to its Telegram user) go, open codes are burnt; sessions are revoked. A customer with orders keeps
 * the Customer row (shop accounting, admin notes; signing in again later creates a fresh account on it); one
 * without orders is removed entirely (privacy).
 */
export async function deleteAccount(cid: number): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const c = await tx.customer.findUnique({ where: { id: cid }, select: { id: true, phone: true, telegramUserId: true } })
    if (!c) return false
    await tx.customerAddress.deleteMany({ where: { customerId: cid } })
    await tx.favorite.deleteMany({ where: { customerId: cid } })
    await tx.customerMessage.deleteMany({ where: { customerId: cid } })
    await tx.customerLogin.deleteMany({
      where: { OR: [{ customerId: cid }, ...(c.telegramUserId ? [{ pendingTelegramUserId: c.telegramUserId }] : [])] },
    })
    // codes are burnt, not deleted: the rows keep counting towards the per-phone limits (and expire within 2 days)
    await tx.customerLoginCode.updateMany({ where: { phone: c.phone, usedAt: null }, data: { usedAt: new Date() } })
    if ((await tx.order.count({ where: { phone: c.phone } })) === 0) {
      await tx.customer.delete({ where: { id: cid } })
      return true
    }
    await tx.customer.update({
      where: { id: cid },
      data: {
        telegramUserId: null,
        telegramChatId: null,
        accountLocale: null,
        notifyTelegram: true,
        accountCreatedAt: null,
        lastLoginAt: null,
        lastSeenAt: null,
        sessionVersion: { increment: 1 },
      },
    })
    return true
  })
}
