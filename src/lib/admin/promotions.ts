import { prisma } from '@/lib/db'
import type { L10n } from '@/lib/localized'
import { logActivity } from './activity'
import type { Staff } from './session'

export type PromoKind = 'PERCENT' | 'AMOUNT'
export type PromoTargetType = 'PRODUCT' | 'CATEGORY' | 'BRAND'
export type PromoState = 'active' | 'scheduled' | 'expired' | 'off'

/** Editor payload. Dates are Asia/Tashkent wall-clock values from <input type="datetime-local"> ("YYYY-MM-DDTHH:mm") or null. */
export type PromotionInput = {
  id?: number
  name: string
  kind: PromoKind
  value: number
  targetType: PromoTargetType
  targetIds: number[]
  enabled: boolean
  startsAt: string | null
  endsAt: string | null
}

export type PromotionRow = {
  id: number
  name: string
  kind: PromoKind
  value: number
  targetType: PromoTargetType
  targetSummary: string
  enabled: boolean
  startsAt: Date | null
  endsAt: Date | null
  state: PromoState
}

export type PromotionResult = { ok: true; id: number } | { ok: false; error: string }
export type TargetOption = { id: number; label: string }

const KINDS: readonly string[] = ['PERCENT', 'AMOUNT']
const TARGETS: readonly string[] = ['PRODUCT', 'CATEGORY', 'BRAND']
const MAX_TARGETS = 500
const MAX_AMOUNT = 1_000_000_000
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000 // UTC+5, no DST

/** "YYYY-MM-DDTHH:mm" in Tashkent -> Date; null for empty input, undefined for garbage. */
export function fromTashkentLocal(s: string | null | undefined): Date | null | undefined {
  if (s === null || s === undefined || s === '') return null
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return undefined
  const d = new Date(`${s}:00+05:00`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** Date -> "YYYY-MM-DDTHH:mm" Tashkent wall clock (for datetime-local inputs and tables). */
export function toTashkentLocal(d: Date | null): string | null {
  return d ? new Date(d.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 16) : null
}

export function promoState(p: { enabled: boolean; startsAt: Date | null; endsAt: Date | null }, now: Date): PromoState {
  if (!p.enabled) return 'off'
  if (p.endsAt && now >= p.endsAt) return 'expired'
  if (p.startsAt && now < p.startsAt) return 'scheduled'
  return 'active'
}

const idsOf = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : [])
const nameOf = (v: unknown, fallback: string) => {
  const n = (v && typeof v === 'object' ? v : {}) as L10n
  return n.en || n.uz || n.ru || fallback
}

/** Labels for every product, category and brand: the target picker's options and the list's summaries. */
export async function targetOptions(): Promise<Record<PromoTargetType, TargetOption[]>> {
  const [products, categories, brands] = await Promise.all([
    prisma.product.findMany({ select: { id: true, slug: true, title: true }, orderBy: [{ id: 'desc' }] }),
    prisma.category.findMany({ select: { id: true, slug: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    prisma.brand.findMany({ select: { id: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
  ])
  return {
    PRODUCT: products.map((p) => ({ id: p.id, label: nameOf(p.title, p.slug) })),
    CATEGORY: categories.map((c) => ({ id: c.id, label: nameOf(c.name, c.slug) })),
    BRAND: brands.map((b) => ({ id: b.id, label: b.name })),
  }
}

const PLURAL: Record<PromoTargetType, string> = { PRODUCT: 'Products', CATEGORY: 'Categories', BRAND: 'Brands' }

function summary(type: PromoTargetType, ids: number[], labels: Map<number, string>): string {
  const names = ids.map((id) => labels.get(id) ?? `#${id} (deleted)`)
  const shown = names.slice(0, 3).join(', ')
  return `${PLURAL[type]}: ${shown}${names.length > 3 ? ` +${names.length - 3} more` : ''}`
}

export async function listPromotions(now: Date = new Date()): Promise<PromotionRow[]> {
  const [rows, opts] = await Promise.all([prisma.promotion.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }), targetOptions()])
  const labels = {
    PRODUCT: new Map(opts.PRODUCT.map((o) => [o.id, o.label])),
    CATEGORY: new Map(opts.CATEGORY.map((o) => [o.id, o.label])),
    BRAND: new Map(opts.BRAND.map((o) => [o.id, o.label])),
  }
  return rows.map((p) => {
    const targetType = (TARGETS.includes(p.targetType) ? p.targetType : 'PRODUCT') as PromoTargetType
    return {
      id: p.id,
      name: p.name,
      kind: (KINDS.includes(p.kind) ? p.kind : 'PERCENT') as PromoKind,
      value: p.value,
      targetType,
      targetSummary: summary(targetType, idsOf(p.targetIds), labels[targetType]),
      enabled: p.enabled,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      state: promoState(p, now),
    }
  })
}

/** Stored promotion as editor input; null when missing. */
export async function loadPromotionInput(id: number): Promise<PromotionInput | null> {
  const p = await prisma.promotion.findUnique({ where: { id } })
  if (!p) return null
  return {
    id: p.id,
    name: p.name,
    kind: (KINDS.includes(p.kind) ? p.kind : 'PERCENT') as PromoKind,
    value: p.value,
    targetType: (TARGETS.includes(p.targetType) ? p.targetType : 'PRODUCT') as PromoTargetType,
    targetIds: idsOf(p.targetIds),
    enabled: p.enabled,
    startsAt: toTashkentLocal(p.startsAt),
    endsAt: toTashkentLocal(p.endsAt),
  }
}

async function existingTargets(type: PromoTargetType, ids: number[]): Promise<number> {
  const where = { id: { in: ids } }
  if (type === 'PRODUCT') return prisma.product.count({ where })
  if (type === 'CATEGORY') return prisma.category.count({ where })
  return prisma.brand.count({ where })
}

type Clean = { name: string; kind: PromoKind; value: number; targetType: PromoTargetType; targetIds: number[]; enabled: boolean; startsAt: Date | null; endsAt: Date | null }

async function validate(input: PromotionInput): Promise<{ ok: true; data: Clean } | { ok: false; error: string }> {
  const name = typeof input?.name === 'string' ? input.name.trim() : ''
  if (!name || name.length > 100) return { ok: false, error: 'Name is required (up to 100 characters).' }
  if (!KINDS.includes(input?.kind)) return { ok: false, error: 'Discount type must be percent or fixed amount.' }
  const value = input.value
  if (input.kind === 'PERCENT' && (!Number.isInteger(value) || value < 1 || value > 90)) return { ok: false, error: 'Percent must be a whole number from 1 to 90.' }
  if (input.kind === 'AMOUNT' && (!Number.isInteger(value) || value < 1 || value > MAX_AMOUNT)) return { ok: false, error: 'Amount must be a whole number of so\'m, at least 1.' }
  if (!TARGETS.includes(input?.targetType)) return { ok: false, error: 'Choose what the promotion applies to.' }
  const targetIds = [...new Set(Array.isArray(input.targetIds) ? input.targetIds : [])]
  if (targetIds.length === 0) return { ok: false, error: 'Pick at least one target.' }
  if (targetIds.length > MAX_TARGETS || !targetIds.every((id) => Number.isInteger(id))) return { ok: false, error: 'Invalid targets.' }
  if ((await existingTargets(input.targetType, targetIds)) !== targetIds.length) return { ok: false, error: 'Some of the picked targets no longer exist. Reload and pick again.' }
  const startsAt = fromTashkentLocal(input.startsAt)
  const endsAt = fromTashkentLocal(input.endsAt)
  if (startsAt === undefined || endsAt === undefined) return { ok: false, error: 'Dates must be valid date and time values.' }
  if (startsAt && endsAt && endsAt <= startsAt) return { ok: false, error: 'The end must be after the start.' }
  if (typeof input.enabled !== 'boolean') return { ok: false, error: 'Invalid on/off value.' }
  return { ok: true, data: { name, kind: input.kind, value, targetType: input.targetType, targetIds, enabled: input.enabled, startsAt, endsAt } }
}

const discountText = (d: Clean) => `${d.kind === 'PERCENT' ? `-${d.value}%` : `-${d.value} so'm`} on ${d.targetIds.length} ${d.targetType.toLowerCase()}(s)`

export async function savePromotion(input: PromotionInput, actor: Staff): Promise<PromotionResult> {
  const id = input?.id
  if (id !== undefined && !Number.isInteger(id)) return { ok: false, error: 'Promotion not found.' }
  const v = await validate(input)
  if (!v.ok) return v
  if (id === undefined) {
    const p = await prisma.promotion.create({ data: v.data })
    await logActivity(actor, 'create', 'promotion', p.id, `Created promotion "${v.data.name}" (${discountText(v.data)})`)
    return { ok: true, id: p.id }
  }
  const r = await prisma.promotion.updateMany({ where: { id }, data: v.data })
  if (r.count !== 1) return { ok: false, error: 'Promotion not found.' }
  await logActivity(actor, 'update', 'promotion', id, `Updated promotion "${v.data.name}" (${discountText(v.data)})`)
  return { ok: true, id }
}

export async function togglePromotion(id: number, enabled: boolean, actor: Staff): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(id) || typeof enabled !== 'boolean') return { ok: false, error: 'Promotion not found.' }
  const p = await prisma.promotion.findUnique({ where: { id }, select: { name: true } })
  if (!p) return { ok: false, error: 'Promotion not found.' }
  const r = await prisma.promotion.updateMany({ where: { id }, data: { enabled } })
  if (r.count !== 1) return { ok: false, error: 'Promotion not found.' }
  await logActivity(actor, 'update', 'promotion', id, `${enabled ? 'Switched on' : 'Switched off'} promotion "${p.name}"`)
  return { ok: true }
}

export async function deletePromotion(id: number, actor: Staff): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(id)) return { ok: false, error: 'Promotion not found.' }
  const p = await prisma.promotion.findUnique({ where: { id }, select: { name: true } })
  if (!p) return { ok: false, error: 'Promotion not found.' }
  const r = await prisma.promotion.deleteMany({ where: { id } })
  if (r.count !== 1) return { ok: false, error: 'Promotion not found.' }
  // Past order lines keep their promotionId and discount snapshot.
  await logActivity(actor, 'delete', 'promotion', id, `Deleted promotion "${p.name}"`)
  return { ok: true }
}
