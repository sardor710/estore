import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { isSellable } from '@/lib/visibility'
import { getSettings } from '@/lib/settings'
import { locales, type Locale } from '@/i18n/routing'
import { t, type L10n } from '@/lib/localized'
import { normalizeUzPhone } from '@/lib/phone'
import { getRegion } from '@/lib/regions'
import { notifyNewOrder, type NotifyOrder } from '@/lib/telegram'
import { isVariantId, MAX_LINE_QTY, type CartLine } from '@/lib/cart/cart'
import { loadPricer } from '@/lib/promotions'
import { upsertCustomerFromOrder } from '@/lib/customers'
import { insertAddress } from '@/lib/account/addresses'
import { cleanLatLng, mapLinks } from '@/lib/geo'

export type OrderStatus = 'NEW' | 'CONFIRMED' | 'SHIPPING' | 'DELIVERED' | 'CANCELLED'
export type CreateOrderInput = {
  lines: CartLine[]
  name: string
  phone: string
  region: string
  address: string
  comment?: string
  locale: Locale
  /** Signed-in customer (the route has already forced `phone` to the account phone). Only used for saveAddress. */
  accountCustomerId?: number
  /** Also store the delivery address in the account (best effort; never fails the order). */
  saveAddress?: { label: string } | null
  /** Optional delivery pin from Telegram location sharing / geolocation; validated by cleanLatLng. */
  location?: { lat?: unknown; lng?: unknown } | null
  /** CASH (default, pay on delivery) or CARD (online via Octo: payment PENDING + a secret payToken for the order link). */
  payMethod?: 'CASH' | 'CARD'
}
export type CreateOrderResult = { ok: true; number: number; id: number; payToken: string | null } | { ok: false; error: 'INVALID' | 'OUT_OF_STOCK' | 'BELOW_MIN' | 'BLOCKED' }
export type StatusResult = { ok: true } | { ok: false; error: 'INSUFFICIENT_STOCK' | 'BAD_TRANSITION' }

export { MAX_LINE_QTY }
export const FIRST_ORDER_NUMBER = 1001

const asL10n = (v: unknown): L10n => (v && typeof v === 'object' && !Array.isArray(v) ? (v as L10n) : {})
const firstImage = (v: unknown): string | null => (Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null)

function cleanLines(raw: unknown): CartLine[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) return null
  const merged = new Map<number, number>()
  for (const l of raw) {
    const v = (l as CartLine | null)?.variantId
    const q = (l as CartLine | null)?.qty
    if (!isVariantId(v) || typeof q !== 'number' || !Number.isInteger(q) || q < 1 || q > MAX_LINE_QTY) return null
    merged.set(v, Math.min(MAX_LINE_QTY, (merged.get(v) ?? 0) + q))
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
  /** Effective (after promotion) unit price */
  priceUzs: number
  /** Unit price before promotions: equal to priceUzs without a promotion, 0 for unavailable items */
  originalUzs: number
  stock: number
  available: boolean
}
export type Quote = { items: QuoteItem[]; totalUzs: number; minOrderUzs: number }

/** Current DB prices (after promotions) for a cart. Unpublished/missing variants come back `available: false` and are excluded from the total. */
export async function quoteCart(lines: CartLine[], locale: Locale): Promise<Quote> {
  const ids = [...new Set(lines.map((l) => l.variantId))]
  const [rows, settings, price] = await Promise.all([
    prisma.variant.findMany({ where: { id: { in: ids } }, include: { product: true } }),
    getSettings(),
    loadPricer(),
  ])
  const byId = new Map(rows.map((r) => [r.id, r]))
  let total = 0
  const items = lines.map<QuoteItem>((l) => {
    const v = byId.get(l.variantId)
    if (!v || !isSellable(v.product)) {
      return { variantId: l.variantId, qty: l.qty, title: '', variantName: '', image: null, priceUzs: 0, originalUzs: 0, stock: 0, available: false }
    }
    const p = price(v)
    total += p.priceUzs * l.qty
    return {
      variantId: v.id,
      qty: l.qty,
      title: t(asL10n(v.product.title), locale),
      variantName: t(asL10n(v.name), locale),
      image: firstImage(v.product.images),
      priceUzs: p.priceUzs,
      originalUzs: p.originalUzs,
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
  const loc = input?.location && typeof input.location === 'object' ? input.location : null
  const pin = cleanLatLng(loc?.lat, loc?.lng)
  if (
    !lines || name.length < 2 || name.length > 100 || address.length < 3 || address.length > 300 || comment.length > 500 ||
    !phone || !region || !(locales as readonly string[]).includes(locale) || pin === 'INVALID'
  ) {
    return { ok: false, error: 'INVALID' }
  }
  // A blocked client is refused before any stock/price work, with nothing but the code to say why.
  const known = await prisma.customer.findUnique({ where: { phone }, select: { blocked: true } })
  if (known?.blocked) return { ok: false, error: 'BLOCKED' }
  const { minOrderUzs } = await getSettings()

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const order = await prisma.$transaction(async (tx) => {
        const rows = await tx.variant.findMany({ where: { id: { in: lines.map((l) => l.variantId) } }, include: { product: true } })
        const byId = new Map(rows.map((r) => [r.id, r]))
        // Promotions are read inside the transaction: a promo switched off before submit no longer applies.
        const price = await loadPricer(tx)
        let total = 0
        const snap = lines.map((l) => {
          const v = byId.get(l.variantId)
          if (!v || !isSellable(v.product)) throw new Rollback('INVALID')
          if (l.qty > v.stock) throw new Rollback('OUT_OF_STOCK')
          const p = price(v)
          total += p.priceUzs * l.qty
          return {
            variantId: v.id,
            sku: v.sku,
            productTitle: t(asL10n(v.product.title), locale),
            variantName: t(asL10n(v.name), locale),
            priceUzs: p.priceUzs,
            originalPriceUzs: p.originalUzs,
            discountUzs: p.discountUzs,
            promotionId: p.promotionId,
            qty: l.qty,
          }
        })
        if (total < minOrderUzs) throw new Rollback('BELOW_MIN')
        const max = await tx.order.aggregate({ _max: { number: true } })
        const number = Math.max(max._max.number ?? 0, FIRST_ORDER_NUMBER - 1) + 1
        await upsertCustomerFromOrder(tx, { phone, name, region: region.code })
        const card = input.payMethod === 'CARD'
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
            lat: pin?.lat ?? null,
            lng: pin?.lng ?? null,
            ...(card ? { payMethod: 'CARD', paymentStatus: 'PENDING', payToken: randomBytes(24).toString('base64url') } : {}),
            lines: { create: snap },
            events: { create: [{ status: 'NEW' }] },
          },
          include: { lines: true },
        })
      })

      if (input.accountCustomerId != null && input.saveAddress) {
        await saveOrderAddress(input.accountCustomerId, phone, { label: input.saveAddress.label, recipient: name, region: region.code, address, lat: pin?.lat ?? null, lng: pin?.lng ?? null })
      }

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
        mapUrl: pin ? mapLinks(pin.lat, pin.lng).google : null,
        payMethod: order.payMethod === 'CARD' ? 'CARD' : 'CASH',
      }
      try {
        Promise.resolve((deps.notify ?? notifyNewOrder)(payload)).catch(() => {})
      } catch {
        // notifier must never break order creation
      }
      return { ok: true, number: order.number, id: order.id, payToken: order.payToken }
    } catch (e) {
      if (e instanceof Rollback) return { ok: false, error: e.code }
      if (isUniqueViolation(e) && attempt < 4) continue // number race: retry with a fresh max
      throw e
    }
  }
  return { ok: false, error: 'INVALID' }
}

/**
 * Best effort, after the order is committed: only for an existing account that owns the order phone; skipped at
 * the address limit or when the same address is already saved. Errors are logged and swallowed.
 */
async function saveOrderAddress(cid: number, phone: string, a: { label: unknown; recipient: string; region: string; address: string; lat: number | null; lng: number | null }): Promise<void> {
  try {
    if (!Number.isSafeInteger(cid) || cid <= 0) return
    const label = typeof a.label === 'string' ? a.label.trim().slice(0, 40) : ''
    await prisma.$transaction(async (tx) => {
      const c = await tx.customer.findUnique({ where: { id: cid }, select: { phone: true, accountCreatedAt: true } })
      if (!c || !c.accountCreatedAt || c.phone !== phone) return
      await insertAddress(tx, cid, { label, recipient: a.recipient, region: a.region, address: a.address, lat: a.lat, lng: a.lng }, { skipDuplicate: true })
    })
  } catch (e) {
    console.error('[orders] saving the account address failed', e)
  }
}

// ---------- status ----------

const TRANSITIONS: Record<string, OrderStatus[]> = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  // SHIPPING ('out for delivery') is optional: CONFIRMED may still go straight to DELIVERED.
  CONFIRMED: ['SHIPPING', 'DELIVERED', 'CANCELLED'],
  SHIPPING: ['DELIVERED', 'CANCELLED'],
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
      await tx.orderStatusEvent.create({ data: { orderId, status: to } })

      const perVariant = new Map<number, number>()
      for (const l of order.lines) perVariant.set(l.variantId, (perVariant.get(l.variantId) ?? 0) + l.qty)

      if (order.status === 'NEW' && to === 'CONFIRMED') {
        for (const [variantId, qty] of perVariant) {
          const r = await tx.variant.updateMany({ where: { id: variantId, stock: { gte: qty } }, data: { stock: { decrement: qty } } })
          if (r.count !== 1) throw new Insufficient()
        }
      } else if ((order.status === 'CONFIRMED' || order.status === 'SHIPPING') && to === 'CANCELLED') {
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
