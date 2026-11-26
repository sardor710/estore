import { createHmac, timingSafeEqual } from 'node:crypto'

/** ERP constants for company Zanko. */
export const ERP = {
  company: 'Zanko',
  warehouse: 'Stores - Z',
  priceList: 'Zanko Retail',
  customer: 'zanko.uz Website',
  itemGroupRoot: 'Zanko',
  currency: 'UZS',
} as const

export type OutboxKind = 'DELIVER' | 'RETURN' | 'RECEIPT'
export type OutboxLine = { sku: string; qty: number; rateUzs: number }

/**
 * Stock the website may sell: ERP's actual qty, minus units in confirmations the ERP has not
 * received yet, plus units in cancellations it has not received yet. Without this, a webhook or a
 * reconcile during an ERP outage would hand back stock that was already sold.
 */
export function siteStock(erpActual: number, pendingOut: number, pendingBack: number): number {
  return Math.max(0, Math.floor(erpActual) - pendingOut + pendingBack)
}

/** Frappe webhook signature: base64(HMAC-SHA256(secret, raw body)). */
export function verifyErpSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!secret || !header) return false
  const want = createHmac('sha256', secret).update(rawBody).digest()
  let got: Buffer
  try {
    got = Buffer.from(header.trim(), 'base64')
  } catch {
    return false
  }
  return got.length === want.length && timingSafeEqual(got, want)
}

export function parseLines(lines: unknown): OutboxLine[] {
  const raw = typeof lines === 'string' ? JSON.parse(lines) : lines
  return Array.isArray(raw) ? (raw as OutboxLine[]) : []
}

/**
 * Units per SKU that the ERP has not been told about yet. Errs towards selling less: a FAILED
 * delivery keeps its deduction, but a FAILED return/receipt adds nothing (ERP may already hold
 * those units back, e.g. a Delivery Note cancelled by hand), so the site shows ERP's figure.
 */
export function pendingBySku(rows: { kind: string; status: string; lines: unknown }[]): Map<string, { out: number; back: number }> {
  const m = new Map<string, { out: number; back: number }>()
  for (const r of rows) {
    const counts = r.status === 'PENDING' || r.status === 'RUNNING' || (r.status === 'FAILED' && r.kind === 'DELIVER')
    if (!counts) continue
    for (const l of parseLines(r.lines)) {
      const cur = m.get(l.sku) ?? { out: 0, back: 0 }
      if (r.kind === 'DELIVER') cur.out += l.qty
      else cur.back += l.qty
      m.set(l.sku, cur)
    }
  }
  return m
}
