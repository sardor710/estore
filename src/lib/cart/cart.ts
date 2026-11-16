export type CartLine = { variantId: number; qty: number }

export const MAX_LINE_QTY = 999
/** DB ids are 32-bit signed ints: anything outside is not a variant (and would make the query throw). */
export const MAX_VARIANT_ID = 2_147_483_647
export const isVariantId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_VARIANT_ID

const isQty = (n: number) => Number.isInteger(n) && n > 0

/** Adds qty to the line (creating it). `max` caps the resulting qty when the caller knows stock. */
export function addItem(lines: CartLine[], variantId: number, qty: number, max?: number): CartLine[] {
  if (!isQty(qty)) return lines
  const cap = (n: number) => (max != null && max > 0 ? Math.min(n, max) : n)
  const found = lines.find((l) => l.variantId === variantId)
  if (!found) return [...lines, { variantId, qty: cap(qty) }]
  return lines.map((l) => (l.variantId === variantId ? { ...l, qty: cap(l.qty + qty) } : l))
}

/** Sets qty; qty <= 0 removes the line. Unknown variants are ignored. */
export function setQty(lines: CartLine[], variantId: number, qty: number): CartLine[] {
  if (!Number.isFinite(qty)) return lines
  const q = Math.floor(qty)
  if (q <= 0) return removeItem(lines, variantId)
  return lines.map((l) => (l.variantId === variantId ? { ...l, qty: q } : l))
}

export function removeItem(lines: CartLine[], variantId: number): CartLine[] {
  return lines.filter((l) => l.variantId !== variantId)
}

export function countLines(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.qty, 0)
}

/** Parses untrusted stored/posted JSON into clean lines. */
export function sanitizeLines(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return []
  let out: CartLine[] = []
  for (const r of raw) {
    if (r && typeof r === 'object') {
      const { variantId, qty } = r as Record<string, unknown>
      if (isVariantId(variantId) && typeof qty === 'number' && isQty(qty)) {
        out = addItem(out, variantId, qty, MAX_LINE_QTY)
      }
    }
  }
  return out
}
