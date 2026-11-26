import { prisma } from '@/lib/db'

/** A signed-in customer's "last seen" is kept in slots of this length and rewritten at most once per slot. */
export const LAST_SEEN_STEP_MS = 5 * 60_000

/** Start of the slot that `now` falls into. */
const slotOf = (now: Date) => new Date(Math.floor(now.getTime() / LAST_SEEN_STEP_MS) * LAST_SEEN_STEP_MS)

/** True when a signed-in view at `now` should move the stored "last seen" forward. */
export function lastSeenIsStale(lastSeenAt: Date | null, now: Date): boolean {
  return !lastSeenAt || lastSeenAt < slotOf(now)
}

/** A website sign-in (Telegram link or 6-digit code) just succeeded. Only existing accounts are stamped. */
export async function markSignedIn(customerId: number, now: Date): Promise<void> {
  await prisma.customer.updateMany({ where: { id: customerId, accountCreatedAt: { not: null } }, data: { lastLoginAt: now, lastSeenAt: now } })
}

/**
 * A signed-in page view (website or Mini App). Stores the START of the 5-minute slot, never the view's own time:
 * an exact time would equal PageView.createdAt and tie the customer to that day's anonymous visitor hash.
 * The WHERE clause is the throttle (one write per slot, across processes) and never moves the time backwards;
 * a row whose account was deleted in the meantime is left alone. Returns whether a row was written.
 */
export async function touchLastSeen(customerId: number, now: Date): Promise<boolean> {
  const slot = slotOf(now)
  const r = await prisma.customer.updateMany({
    where: { id: customerId, accountCreatedAt: { not: null }, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: slot } }] },
    data: { lastSeenAt: slot },
  })
  return r.count > 0
}
