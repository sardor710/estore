/**
 * One-time export of every store SKU into ERPNext (company Zanko), safe to re-run.
 *   tsx scripts/erp-export.ts --dry-run   # what would happen, nothing written
 *   tsx scripts/erp-export.ts             # items + photos + prices, opening stock, diff report
 * Exit code 1 when the final diff shows any mismatch.
 *
 * Cutover: run with ERP_ENABLED unset (no outbox while items/photos upload). Site stock is read
 * right before the opening Stock Reconciliation, which also stamps `erp.cutoverAt`; then set
 * ERP_ENABLED=1 and restart at once.
 */
import 'dotenv/config'
import { prisma } from '../src/lib/db'
import { erpConfig, erpInsert, erpList } from '../src/lib/erp/client'
import { ERP } from '../src/lib/erp/core'
import { ensureErpItems } from '../src/lib/erp/items'
import { fetchErpSnapshot } from '../src/lib/erp/snapshot'

const OPENING_REF = 'ZK-OPENING' // unique zanko_order_ref on the opening Stock Reconciliation

async function diff() {
  const variants = await prisma.variant.findMany({ select: { sku: true, stock: true, priceUzs: true } })
  const snap = await fetchErpSnapshot(variants.map((v) => v.sku))
  const missing = variants.filter((v) => !snap.items.has(v.sku)).map((v) => v.sku)
  const price = variants.filter((v) => snap.items.has(v.sku) && snap.price.get(v.sku) !== v.priceUzs).map((v) => `${v.sku}: site ${v.priceUzs} / erp ${snap.price.get(v.sku) ?? '—'}`)
  const stock = variants.filter((v) => snap.items.has(v.sku) && (snap.stock.get(v.sku) ?? 0) !== v.stock).map((v) => `${v.sku}: site ${v.stock} / erp ${snap.stock.get(v.sku) ?? 0}`)
  const units = variants.reduce((a, v) => a + (snap.stock.get(v.sku) ?? 0), 0)
  console.log(JSON.stringify({ skus: variants.length, inErp: snap.items.size, erpUnits: units, missing, priceMismatch: price, stockMismatch: stock }, null, 2))
  return missing.length + price.length + stock.length
}

async function main() {
  if (!erpConfig()) throw new Error('ERP_URL / ERP_API_KEY / ERP_API_SECRET missing')
  const dry = process.argv.includes('--dry-run')
  const variants = await prisma.variant.findMany({ select: { id: true, sku: true, stock: true } })
  const opening = await erpList('Stock Reconciliation', [['zanko_order_ref', '=', OPENING_REF], ['docstatus', '=', 1]])

  if (dry) {
    const snap = await fetchErpSnapshot(variants.map((v) => v.sku))
    console.log(JSON.stringify({
      skus: variants.length,
      alreadyInErp: snap.items.size,
      toCreate: variants.length - snap.items.size,
      openingStock: opening.length ? 'already done' : { skus: variants.filter((v) => v.stock > 0).length, units: variants.reduce((a, v) => a + Math.max(0, v.stock), 0) },
    }, null, 2))
    return 0
  }

  if (process.env.ERP_ENABLED === '1' && !opening.length) console.warn('WARNING: ERP_ENABLED=1 during the first export; orders confirmed now may fail to push')
  // First run: the opening Stock Reconciliation books all stock; later runs book stock per newly linked SKU.
  const r = await ensureErpItems({ all: true, withImages: true, openingStock: opening.length > 0 })
  console.log('items:', JSON.stringify(r))
  if (r.failed.length) console.error('FAILED ITEMS — fix and re-run:', r.failed)

  // Read stock only now: orders confirmed during the (long) photo upload are already deducted.
  const withStock = (await prisma.variant.findMany({ select: { sku: true, stock: true } })).filter((v) => v.stock > 0)
  if (opening.length === 0 && withStock.length) {
    const snap = await fetchErpSnapshot(withStock.map((v) => v.sku))
    const rows = withStock.filter((v) => snap.items.has(v.sku))
    const doc = await erpInsert('Stock Reconciliation', {
      company: ERP.company,
      purpose: 'Stock Reconciliation',
      set_warehouse: ERP.warehouse,
      zanko_order_ref: OPENING_REF,
      remarks: 'Opening stock from zanko.uz (2026-11-26)',
      docstatus: 1,
      items: rows.map((v) => ({ item_code: v.sku, warehouse: ERP.warehouse, qty: v.stock, valuation_rate: 0, allow_zero_valuation_rate: 1 })),
    })
    const now = new Date().toISOString()
    await prisma.setting.upsert({ where: { key: 'erp.cutoverAt' }, create: { key: 'erp.cutoverAt', value: now }, update: { value: now } })
    console.log('opening stock:', doc.name, `${rows.length} SKUs`, 'cutoverAt', now)
  } else {
    console.log('opening stock:', opening.length ? `already done (${opening[0].name})` : 'nothing in stock')
  }
  if (!(await prisma.setting.findUnique({ where: { key: 'erp.cutoverAt' } }))) {
    await prisma.setting.create({ data: { key: 'erp.cutoverAt', value: new Date().toISOString() } })
  }
  return (await diff()) === 0 && r.failed.length === 0 ? 0 : 1
}

main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(1) })
