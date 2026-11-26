/**
 * ERPNext → store: copies ERP stock (minus not-yet-pushed sales) and Zanko Retail prices onto
 * linked variants. Used by the webhook (one SKU) and the 5-minute reconcile (all SKUs).
 */
import { prisma } from '@/lib/db'
import { pendingBySku, siteStock } from './core'
import { fetchErpSnapshot } from './snapshot'

export type RefreshResult = { stockChanged: number; priceChanged: number; missingInErp: string[]; missingPrice: string[] }

export async function refreshFromErp(skus?: string[]): Promise<RefreshResult> {
  const variants = await prisma.variant.findMany({
    where: { erpLinkedAt: { not: null }, ...(skus ? { sku: { in: skus } } : {}) },
    select: { id: true, sku: true, stock: true, priceUzs: true },
  })
  const result: RefreshResult = { stockChanged: 0, priceChanged: 0, missingInErp: [], missingPrice: [] }
  const snap = await fetchErpSnapshot(variants.map((v) => v.sku))
  // Read after the variants: a confirmation landing in between changes stock, and the
  // conditional write below then skips that variant (the next refresh picks it up).
  const pending = pendingBySku(
    await prisma.erpOutbox.findMany({ where: { status: { in: ['PENDING', 'RUNNING', 'FAILED'] } }, select: { kind: true, status: true, lines: true } }),
  )

  for (const v of variants) {
    if (!snap.items.has(v.sku)) {
      result.missingInErp.push(v.sku)
      continue
    }
    const p = pending.get(v.sku) ?? { out: 0, back: 0 }
    const stock = siteStock(snap.stock.get(v.sku) ?? 0, p.out, p.back)
    const price = snap.price.get(v.sku)
    if (price === undefined) result.missingPrice.push(v.sku)
    const data: { stock?: number; priceUzs?: number } = {}
    if (stock !== v.stock) data.stock = stock
    if (price !== undefined && price > 0 && price !== v.priceUzs) data.priceUzs = price
    if (Object.keys(data).length === 0) continue
    const w = await prisma.variant.updateMany({ where: { id: v.id, stock: v.stock }, data })
    if (w.count === 1) {
      if (data.stock !== undefined) result.stockChanged++
      if (data.priceUzs !== undefined) result.priceChanged++
    }
  }

  if (!skus) {
    const now = new Date().toISOString()
    const summary = JSON.stringify({ ...result, at: now, skus: variants.length })
    await prisma.setting.upsert({ where: { key: 'erp.lastReconcileAt' }, create: { key: 'erp.lastReconcileAt', value: now }, update: { value: now } })
    await prisma.setting.upsert({ where: { key: 'erp.lastReconcileResult' }, create: { key: 'erp.lastReconcileResult', value: summary }, update: { value: summary } })
  }
  return result
}
