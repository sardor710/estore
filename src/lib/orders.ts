import { prisma } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { locales, type Locale } from '@/i18n/routing'
import { t, type L10n } from '@/lib/localized'
import { normalizeUzPhone } from '@/lib/phone'
import { getRegion } from '@/lib/regions'
import { notifyNewOrder, type NotifyOrder } from '@/lib/telegram'
import type { CartLine } from '@/lib/cart/cart'

export type OrderStatus = 'NEW' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED'
export type CreateOrderInput = {
  lines: CartLine[]
  name: string
  phone: string
  region: string
  address: string
  comment?: string
  locale: Locale
}
export type CreateOrderResult = { ok: true; number: number } | { ok: false; error: 'INVALID' | 'OUT_OF_STOCK' | 'BELOW_MIN' }
export type StatusResult = { ok: true } | { ok: false; error: 'INSUFFICIENT_STOCK' | 'BAD_TRANSITION' }

export const MAX_LINE_QTY = 999
export const FIRST_ORDER_NUMBER = 1001

const asL10n = (v: unknown): L10n => (v && typeof v === 'object' && !Array.isArray(v) ? (v as L10n) : {})
const firstImage = (v: unknown): string | null => (Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null)

function cleanLines(raw: unknown): CartLine[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) return null
  const merged = new Map<number, number>()
  for (const l of raw) {
    const v = (l as CartLine | null)?.variantId
    const q = (l as CartLine | null)?.qty
    if (typeof v !== 'number' || !Number.isInteger(v) || typeof q !== 'number' || !Number.isInteger(q) || q < 1 || q > MAX_LINE_QTY) return null
    merged.set(v, (merged.get(v) ?? 0) + q)
  }
  return [...merged].map(([variantId, qty]) => ({ variantId, qty }))
}

// ---------- quote ----------

export type QuoteItem = {
  variantId: number
  qty: number
  title: string
  variantName: string
  image: string | null
  priceUzs: number
  stock: number
  available: boolean
}
export type Quote = { items: QuoteItem[]; totalUzs: number; minOrderUzs: number }

/** Current DB prices for a cart. Unpublished/missing variants come back `available: false` and are excluded from the total. */
export async function quoteCart(lines: CartLine[], locale: Locale): Promise<Quote> {
  const ids = [...new Set(lines.map((l) => l.variantId))]
  const [rows, settings] = await Promise.all([
    prisma.variant.findMany({ where: { id: { in: ids } }, include: { product: true } }),
    getSettings(),
  ])
  const byId = new Map(rows.map((r) => [r.id, r]))
  let total = 0
  const items = lines.map<QuoteItem>((l) => {
    const v = byId.get(l.variantId)
    if (!v || v.product.status !== 'PUBLISHED') {
      return { variantId: l.variantId, qty: l.qty, title: '', variantName: '', image: null, priceUzs: 0, stock: 0, available: false }
    }
    total += v.priceUzs * l.qty
    return {
      variantId: v.id,
      qty: l.qty,
      title: t(asL10n(v.product.title), locale),
      variantName: t(asL10n(v.name), locale),
      image: firstImage(v.product.images),
      priceUzs: v.priceUzs,
      stock: v.stock,
      available: true,
    }
  })
  return { items, totalUzs: total, minOrderUzs: settings.minOrderUzs }
}

// ---------- create ----------

class Rollback extends Error {
  constructor(public code: 'INVALID' | 'OUT_OF_STOCK' | 'BELOW_MIN') {
    super(code)
  }
}

const isUniqueViolation = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'

export async function createOrder(
  input: CreateOrderInput,
  deps: { notify?: (o: NotifyOrder) => Promise<unknown> | unknown } = {},
): Promise<CreateOrderResult> {
  const lines = cleanLines(input?.lines)
  const name = typeof input?.name === 'string' ? input.name.trim() : ''
  const address = typeof input?.address === 'string' ? input.address.trim() : ''
  const comment = typeof input?.comment === 'string' ? input.comment.trim() : ''
  const phone = typeof input?.phone === 'string' ? normalizeUzPhone(input.phone) : null
  const region = typeof input?.region === 'string' ? getRegion(input.region) : undefined
  const locale = input?.locale
  if (
    !lines || name.length < 2 || name.length > 100 || address.length < 3 || address.length > 300 || comment.length > 500 ||
    !phone || !region || !(locales as readonly string[]).includes(locale)
  ) {
    return { ok: false, error: 'INVALID' }
  }
  const { minOrderUzs } = await getSettings()

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const order = await prisma.$transaction(async (tx) => {
        const rows = await tx.variant.findMany({ where: { id: { in: lines.map((l) => l.variantId) } }, include: { product: true } })
        const byId = new Map(rows.map((r) => [r.id, r]))
        let total = 0
        const snap = lines.map((l) => {
          const v = byId.get(l.variantId)
          if (!v || v.product.status !== 'PUBLISHED') throw new Rollback('INVALID')
          if (l.qty > v.stock) throw new Rollback('OUT_OF_STOCK')
          total += v.priceUzs * l.qty
          return {
            variantId: v.id,
            sku: v.sku,
            productTitle: t(asL10n(v.product.title), locale),
            variantName: t(asL10n(v.name), locale),
            priceUzs: v.priceUzs,
            qty: l.qty,
          }
        })
        if (total < minOrderUzs) throw new Rollback('BELOW_MIN')
        const max = await tx.order.aggregate({ _max: { number: true } })
        const number = Math.max(max._max.number ?? 0, FIRST_ORDER_NUMBER - 1) + 1
        return tx.order.create({
          data: {
            number,
            name,
            phone,
            region: region.code,
            address,
            comment: comment || null,
            locale,
            totalUzs: total,
            lines: { create: snap },
          },
          include: { lines: true },
        })
      })

      // Fire-and-forget: never affects the response.
      const payload: NotifyOrder = {
        number: order.number,
        name: order.name,
        phone: order.phone,
        region: t(region.name, 'uz'),
        address: order.address,
        comment: order.comment,
        totalUzs: order.totalUzs,
        lines: order.lines,
      }
      try {
        Promise.resolve((deps.notify ?? notifyNewOrder)(payload)).catch(() => {})
      } catch {
        // notifier must never break order creation
      }
      return { ok: true, number: order.number }
    } catch (e) {
      if (e instanceof Rollback) return { ok: false, error: e.code }
      if (isUniqueViolation(e) && attempt < 4) continue // number race: retry with a fresh max
      throw e
    }
  }
  return { ok: false, error: 'INVALID' }
}

// ---------- status ----------

const TRANSITIONS: Record<string, OrderStatus[]> = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
}

/** Statuses an order may move to from `from` (stock effects are applied by setOrderStatus). */
export function allowedTransitions(from: string): OrderStatus[] {
  return TRANSITIONS[from] ?? []
}

class Insufficient extends Error {}

export async function setOrderStatus(orderId: number, to: OrderStatus): Promise<StatusResult> {
  try {
    return await prisma.$transaction(async (tx): Promise<StatusResult> => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { lines: true } })
      if (!order || !(TRANSITIONS[order.status] ?? []).includes(to)) return { ok: false, error: 'BAD_TRANSITION' }

      // Guard against concurrent transitions: only move if still in the status we read.
      const moved = await tx.order.updateMany({ where: { id: orderId, status: order.status }, data: { status: to } })
      if (moved.count !== 1) return { ok: false, error: 'BAD_TRANSITION' }

      const perVariant = new Map<number, number>()
      for (const l of order.lines) perVariant.set(l.variantId, (perVariant.get(l.variantId) ?? 0) + l.qty)

      if (order.status === 'NEW' && to === 'CONFIRMED') {
        for (const [variantId, qty] of perVariant) {
          const r = await tx.variant.updateMany({ where: { id: variantId, stock: { gte: qty } }, data: { stock: { decrement: qty } } })
          if (r.count !== 1) throw new Insufficient()
        }
      } else if (order.status === 'CONFIRMED' && to === 'CANCELLED') {
        for (const [variantId, qty] of perVariant) {
          await tx.variant.updateMany({ where: { id: variantId }, data: { stock: { increment: qty } } })
        }
      }
      return { ok: true }
    })
  } catch (e) {
    if (e instanceof Insufficient) return { ok: false, error: 'INSUFFICIENT_STOCK' }
    throw e
  }
}
