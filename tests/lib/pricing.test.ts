import { describe, it, expect } from 'vitest'
import { bestPrice, isActive, type PromoRule, type PriceTarget } from '@/lib/pricing'

const now = new Date('2026-11-17T12:00:00Z')
const rule = (o: Partial<PromoRule> = {}): PromoRule => ({
  id: 1,
  kind: 'PERCENT',
  value: 10,
  targetType: 'PRODUCT',
  targetIds: [7],
  enabled: true,
  startsAt: null,
  endsAt: null,
  ...o,
})
const target = (o: Partial<PriceTarget> = {}): PriceTarget => ({ priceUzs: 1_290_000, productId: 7, categoryIds: [3, 1], brandId: 5, ...o })

describe('bestPrice', () => {
  it('10% of 1 290 000 -> 1 161 000', () => {
    expect(bestPrice(target(), [rule()], now)).toEqual({ priceUzs: 1_161_000, originalUzs: 1_290_000, discountUzs: 129_000, promotionId: 1 })
  })
  it('AMOUNT 50 000 beats PERCENT 10% on 300 000', () => {
    const r = bestPrice(target({ priceUzs: 300_000 }), [rule({ id: 1 }), rule({ id: 2, kind: 'AMOUNT', value: 50_000 })], now)
    expect(r).toEqual({ priceUzs: 250_000, originalUzs: 300_000, discountUzs: 50_000, promotionId: 2 })
  })
  it('AMOUNT 2 000 000 on 1 500 000 -> floor 1 000', () => {
    const r = bestPrice(target({ priceUzs: 1_500_000 }), [rule({ kind: 'AMOUNT', value: 2_000_000 })], now)
    expect(r).toEqual({ priceUzs: 1_000, originalUzs: 1_500_000, discountUzs: 1_499_000, promotionId: 1 })
  })
  it('never raises a price that is already below the floor', () => {
    const r = bestPrice(target({ priceUzs: 500 }), [rule({ kind: 'AMOUNT', value: 100 })], now)
    expect(r).toEqual({ priceUzs: 500, originalUzs: 500, discountUzs: 0, promotionId: null })
  })
  it('ignores a disabled rule', () => {
    expect(bestPrice(target(), [rule({ enabled: false })], now).promotionId).toBeNull()
  })
  it('ignores a rule whose endsAt is in the past', () => {
    expect(bestPrice(target(), [rule({ endsAt: new Date('2026-11-17T11:59:59Z') })], now).promotionId).toBeNull()
  })
  it('ignores a rule whose startsAt is in the future', () => {
    expect(bestPrice(target(), [rule({ startsAt: new Date('2026-11-17T12:00:01Z') })], now).promotionId).toBeNull()
  })
  it('CATEGORY rule on a parent category applies to a product in the child', () => {
    const r = bestPrice(target({ categoryIds: [3, 1] }), [rule({ targetType: 'CATEGORY', targetIds: [1] })], now)
    expect(r.promotionId).toBe(1)
    expect(r.priceUzs).toBe(1_161_000)
  })
  it('BRAND rule on another brand is ignored', () => {
    expect(bestPrice(target({ brandId: 5 }), [rule({ targetType: 'BRAND', targetIds: [6] })], now).promotionId).toBeNull()
    expect(bestPrice(target({ brandId: null }), [rule({ targetType: 'BRAND', targetIds: [6] })], now).promotionId).toBeNull()
    expect(bestPrice(target({ brandId: 6 }), [rule({ targetType: 'BRAND', targetIds: [6] })], now).promotionId).toBe(1)
  })
  it('equal discounts -> lower id wins', () => {
    const r = bestPrice(target({ priceUzs: 100_000 }), [rule({ id: 9, kind: 'AMOUNT', value: 10_000 }), rule({ id: 4 })], now)
    expect(r.promotionId).toBe(4)
  })
  it('no rules -> original price', () => {
    expect(bestPrice(target({ priceUzs: 77_000 }), [], now)).toEqual({ priceUzs: 77_000, originalUzs: 77_000, discountUzs: 0, promotionId: null })
  })
})

describe('isActive', () => {
  it('startsAt inclusive, endsAt exclusive', () => {
    expect(isActive(rule({ startsAt: now }), now)).toBe(true)
    expect(isActive(rule({ endsAt: now }), now)).toBe(false)
    expect(isActive(rule({ startsAt: new Date(0), endsAt: new Date('2027-01-01') }), now)).toBe(true)
  })
})
