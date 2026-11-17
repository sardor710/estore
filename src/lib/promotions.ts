import { cache } from 'react'
import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { bestPrice, type PriceResult, type PriceTarget, type PromoRule } from '@/lib/pricing'

// DB side of the pricing engine: loads promotion rules and the category tree, builds PriceTargets.

type Db = Prisma.TransactionClient

type PromotionRow = {
  id: number
  kind: string
  value: number
  targetType: string
  targetIds: unknown
  enabled: boolean
  startsAt: Date | null
  endsAt: Date | null
}

/** DB row -> rule; null for rows with an unknown kind/target (never applied). */
export function toRule(p: PromotionRow): PromoRule | null {
  if (p.kind !== 'PERCENT' && p.kind !== 'AMOUNT') return null
  if (p.targetType !== 'PRODUCT' && p.targetType !== 'CATEGORY' && p.targetType !== 'BRAND') return null
  const targetIds = Array.isArray(p.targetIds) ? p.targetIds.filter((x): x is number => Number.isInteger(x)) : []
  return { id: p.id, kind: p.kind, value: p.value, targetType: p.targetType, targetIds, enabled: p.enabled, startsAt: p.startsAt, endsAt: p.endsAt }
}

/** Rules active at `now`, read through `db` (pass the transaction client to price inside a transaction). */
export async function loadActiveRules(db: Db, now: Date): Promise<PromoRule[]> {
  const rows = await db.promotion.findMany({
    where: {
      enabled: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
    orderBy: { id: 'asc' },
  })
  return rows.map(toRule).filter((r): r is PromoRule => r !== null)
}

/** Active rules, memoised per request render. */
export const getActiveRules = cache(async (now: Date = new Date()): Promise<PromoRule[]> => loadActiveRules(prisma, now))

/** categoryId -> [own id, parent id, grandparent id, ...]. */
export async function categoryAncestry(db: Db = prisma): Promise<Map<number, number[]>> {
  const rows = await db.category.findMany({ select: { id: true, parentId: true } })
  const parentOf = new Map(rows.map((r) => [r.id, r.parentId]))
  const out = new Map<number, number[]>()
  for (const r of rows) {
    const chain: number[] = []
    for (let id: number | null | undefined = r.id; id != null && !chain.includes(id); id = parentOf.get(id)) chain.push(id)
    out.set(r.id, chain)
  }
  return out
}

export function priceTargetFor(
  v: { priceUzs: number; product: { id: number; categoryId: number; brandId: number | null } },
  ancestry: Map<number, number[]>,
): PriceTarget {
  return {
    priceUzs: v.priceUzs,
    productId: v.product.id,
    categoryIds: ancestry.get(v.product.categoryId) ?? [v.product.categoryId],
    brandId: v.product.brandId,
  }
}

export type Pricer = (v: { priceUzs: number; product: { id: number; categoryId: number; brandId: number | null } }) => PriceResult

/**
 * Loads the active rules and the category tree once and returns a function pricing any variant now.
 * Pass the transaction client to read the rules inside a transaction (order creation); otherwise the
 * per-request memoised rules are used.
 */
export async function loadPricer(tx?: Db): Promise<Pricer> {
  const now = new Date()
  const [rules, ancestry] = await Promise.all([tx ? loadActiveRules(tx, now) : getActiveRules(), categoryAncestry(tx)])
  return (v) => bestPrice(priceTargetFor(v, ancestry), rules, now)
}
