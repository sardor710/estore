import { ERP } from './core'
import { erpList } from './client'

export type ErpSnapshot = {
  /** SKUs that exist as Items in ERP. */
  items: Set<string>
  /** actual_qty in the Zanko warehouse; absent = no Bin = 0. */
  stock: Map<string, number>
  /** Zanko Retail selling price; absent = no price in ERP. */
  price: Map<string, number>
}

const CHUNK = 100

/** Reads items, stock and prices for these SKUs (filters only; SKUs may contain "/"). */
export async function fetchErpSnapshot(skus: string[]): Promise<ErpSnapshot> {
  const snap: ErpSnapshot = { items: new Set(), stock: new Map(), price: new Map() }
  for (let i = 0; i < skus.length; i += CHUNK) {
    const part = skus.slice(i, i + CHUNK)
    const [items, bins, prices] = await Promise.all([
      erpList<{ name: string }>('Item', [['name', 'in', part]], ['name']),
      erpList<{ item_code: string; actual_qty: number }>('Bin', [['item_code', 'in', part], ['warehouse', '=', ERP.warehouse]], ['item_code', 'actual_qty']),
      erpList<{ item_code: string; price_list_rate: number }>(
        'Item Price',
        [['item_code', 'in', part], ['price_list', '=', ERP.priceList]],
        ['item_code', 'price_list_rate'],
      ),
    ])
    for (const it of items) snap.items.add(it.name)
    for (const b of bins) snap.stock.set(b.item_code, Number(b.actual_qty) || 0)
    for (const p of prices) snap.price.set(p.item_code, Math.round(Number(p.price_list_rate)))
  }
  return snap
}
