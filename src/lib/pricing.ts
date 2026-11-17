// Pure pricing rules (no DB): shared by the catalog, the cart quote and order creation.

export type PromoRule = {
  id: number
  kind: 'PERCENT' | 'AMOUNT'
  value: number
  targetType: 'PRODUCT' | 'CATEGORY' | 'BRAND'
  targetIds: number[]
  enabled: boolean
  startsAt: Date | null
  endsAt: Date | null
}

export type PriceTarget = {
  priceUzs: number
  productId: number
  /** The product's own category plus all its ancestors. */
  categoryIds: number[]
  brandId: number | null
}

export type PriceResult = { priceUzs: number; originalUzs: number; discountUzs: number; promotionId: number | null }

/** No promotion may take a price below this (whole UZS). */
export const PROMO_FLOOR_UZS = 1000

export function isActive(r: PromoRule, now: Date): boolean {
  return r.enabled && (!r.startsAt || now >= r.startsAt) && (!r.endsAt || now < r.endsAt)
}

function applies(r: PromoRule, t: PriceTarget): boolean {
  switch (r.targetType) {
    case 'PRODUCT':
      return r.targetIds.includes(t.productId)
    case 'CATEGORY':
      return t.categoryIds.some((id) => r.targetIds.includes(id))
    case 'BRAND':
      return t.brandId !== null && r.targetIds.includes(t.brandId)
    default:
      return false
  }
}

/** Discounted price for one rule: never below the floor, never above the original price. */
function priceWith(r: PromoRule, price: number): number {
  const d = r.kind === 'PERCENT' ? Math.round((price * r.value) / 100) : r.value
  return Math.min(price, Math.max(PROMO_FLOOR_UZS, price - d))
}

/** Best single active promotion for a price (never stacked): the largest discount wins, ties go to the lower id. */
export function bestPrice(t: PriceTarget, rules: PromoRule[], now: Date): PriceResult {
  let best: PriceResult = { priceUzs: t.priceUzs, originalUzs: t.priceUzs, discountUzs: 0, promotionId: null }
  for (const r of rules) {
    if (!isActive(r, now) || !applies(r, t)) continue
    const price = priceWith(r, t.priceUzs)
    const discount = t.priceUzs - price
    if (discount <= 0) continue
    if (discount > best.discountUzs || (discount === best.discountUzs && best.promotionId !== null && r.id < best.promotionId)) {
      best = { priceUzs: price, originalUzs: t.priceUzs, discountUzs: discount, promotionId: r.id }
    }
  }
  return best
}
