import { prisma } from '@/lib/db'
import { isSellable } from '@/lib/visibility'
import { MAX_LINE_QTY } from '@/lib/cart/cart'

// A customer's orders = every order whose phone equals the account phone (including orders placed before the
// account existed). `phone` always comes from the session's account, never from the request. An order number
// that belongs to another phone is indistinguishable from a missing one (null -> 404).

export type AccountOrderSummary = {
  number: number
  status: string
  createdAt: Date
  totalUzs: number
  /** Sum of line quantities */
  itemsCount: number
}

export type AccountOrderLine = {
  variantId: number
  sku: string
  /** Snapshot at order time (order locale) */
  productTitle: string
  variantName: string
  priceUzs: number
  originalPriceUzs: number | null
  discountUzs: number
  qty: number
  /** Current product image (variant's own image when set), null when the product is gone */
  image: string | null
  /** Current product slug for a link, null when the product is gone or no longer on the storefront */
  slug: string | null
}

/** `at` is null for a synthetic entry whose time is unknown (a legacy order's current status without history). */
export type AccountOrderEvent = { status: string; at: Date | null; synthetic: boolean }

export type AccountOrderDetail = {
  number: number
  status: string
  createdAt: Date
  name: string
  phone: string
  region: string
  address: string
  comment: string | null
  locale: string
  totalUzs: number
  paymentStatus: string
  lines: AccountOrderLine[]
  /**
   * Oldest first. A "placed" (NEW) entry from createdAt is synthesised when the history has none, and a final
   * `{ status: order.status, at: null, synthetic: true }` when the history does not end in the current status
   * (legacy orders without events).
   */
  events: AccountOrderEvent[]
}

/** `stock` = the variant's current stock, so the client can cap the cart (qty is already capped by it). */
export type BuyAgainResult = { lines: { variantId: number; qty: number; stock: number }[]; unavailable: string[] }

const validNumber = (n: number) => Number.isSafeInteger(n) && n > 0

export async function listAccountOrders(phone: string): Promise<AccountOrderSummary[]> {
  if (!phone) return []
  const rows = await prisma.order.findMany({
    where: { phone },
    orderBy: [{ createdAt: 'desc' }, { number: 'desc' }],
    select: { number: true, status: true, createdAt: true, totalUzs: true, lines: { select: { qty: true } } },
  })
  return rows.map((o) => ({
    number: o.number,
    status: o.status,
    createdAt: o.createdAt,
    totalUzs: o.totalUzs,
    itemsCount: o.lines.reduce((s, l) => s + l.qty, 0),
  }))
}

function pickImage(images: unknown, index: number | null): string | null {
  if (!Array.isArray(images)) return null
  const own = index != null ? images[index] : undefined
  if (typeof own === 'string') return own
  return typeof images[0] === 'string' ? images[0] : null
}

export async function getAccountOrder(phone: string, number: number): Promise<AccountOrderDetail | null> {
  if (!phone || !validNumber(number)) return null
  const o = await prisma.order.findFirst({
    where: { number, phone },
    include: { lines: { orderBy: { id: 'asc' } }, events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
  })
  if (!o) return null
  const variants = await prisma.variant.findMany({
    where: { id: { in: [...new Set(o.lines.map((l) => l.variantId))] } },
    select: { id: true, imageIndex: true, product: { select: { slug: true, images: true, status: true, isDemo: true } } },
  })
  const byId = new Map(variants.map((v) => [v.id, v]))
  const events: AccountOrderEvent[] = o.events.map((e) => ({ status: e.status, at: e.createdAt, synthetic: false }))
  if (!events.some((e) => e.status === 'NEW')) events.unshift({ status: 'NEW', at: o.createdAt, synthetic: true })
  if (events.at(-1)?.status !== o.status) events.push({ status: o.status, at: null, synthetic: true })
  return {
    number: o.number,
    status: o.status,
    createdAt: o.createdAt,
    name: o.name,
    phone: o.phone,
    region: o.region,
    address: o.address,
    comment: o.comment,
    locale: o.locale,
    totalUzs: o.totalUzs,
    paymentStatus: o.paymentStatus,
    lines: o.lines.map((l) => {
      const v = byId.get(l.variantId)
      return {
        variantId: l.variantId,
        sku: l.sku,
        productTitle: l.productTitle,
        variantName: l.variantName,
        priceUzs: l.priceUzs,
        originalPriceUzs: l.originalPriceUzs,
        discountUzs: l.discountUzs,
        qty: l.qty,
        image: v ? pickImage(v.product.images, v.imageIndex) : null,
        slug: v && isSellable(v.product) ? v.product.slug : null,
      }
    }),
    events,
  }
}

/**
 * Lines to put back into the cart: variants that still exist on a storefront product and are in stock, qty capped
 * by stock (the cart re-quotes current prices). Everything else is reported by its snapshot name.
 */
export async function buyAgain(phone: string, number: number): Promise<BuyAgainResult | null> {
  if (!phone || !validNumber(number)) return null
  const o = await prisma.order.findFirst({ where: { number, phone }, include: { lines: { orderBy: { id: 'asc' } } } })
  if (!o) return null
  const wanted = new Map<number, { qty: number; label: string }>()
  for (const l of o.lines) {
    const prev = wanted.get(l.variantId)
    wanted.set(l.variantId, { qty: (prev?.qty ?? 0) + l.qty, label: prev?.label ?? `${l.productTitle} — ${l.variantName}` })
  }
  const variants = await prisma.variant.findMany({
    where: { id: { in: [...wanted.keys()] } },
    select: { id: true, stock: true, product: { select: { status: true, isDemo: true } } },
  })
  const byId = new Map(variants.map((v) => [v.id, v]))
  const lines: BuyAgainResult['lines'] = []
  const unavailable: string[] = []
  for (const [variantId, w] of wanted) {
    const v = byId.get(variantId)
    if (!v || !isSellable(v.product) || v.stock < 1) {
      unavailable.push(w.label)
      continue
    }
    lines.push({ variantId, qty: Math.min(w.qty, v.stock, MAX_LINE_QTY), stock: v.stock })
  }
  return { lines, unavailable }
}
