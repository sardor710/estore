/**
 * Pushes store SKUs into ERPNext as Items of company Zanko (idempotent).
 * Content (names, group, brand, photos) follows the store; price is written only when the ERP has
 * none yet — after that ERPNext owns price and stock.
 */
import { readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { prisma } from '@/lib/db'
import { uploadsDir } from '@/lib/uploads'
import { ERP } from './core'
import { erpList, erpInsert, erpSetValue, erpUploadFile, ErpError } from './client'

export const STOCK_UOM = 'Кол-во' // the UOM the existing items in this ERP use
const ROOT_PARENT = 'Все группы продуктов'
const ITEM_NAME_MAX = 140

type Loaded = { data: Buffer; filename: string }
type ImageLoader = (url: string) => Promise<Loaded | null>

const defaultLoader: ImageLoader = async (url) => {
  const filename = basename(url.split('?')[0]) || 'image'
  if (url.startsWith('/uploads/')) {
    return { data: await readFile(join(uploadsDir(), url.slice('/uploads/'.length))), filename }
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) return null
  return { data: Buffer.from(await res.arrayBuffer()), filename }
}
let imageLoader: ImageLoader = defaultLoader
/** Tests swap the image loader; null restores the default. */
export function setImageLoader(f: ImageLoader | null): void {
  imageLoader = f ?? defaultLoader
}

const en = (v: unknown): string => {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return String(o.en ?? o.ru ?? o.uz ?? '').trim()
  }
  return typeof v === 'string' ? v.trim() : ''
}
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : typeof v === 'string' ? (JSON.parse(v) as unknown[]) : [])
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Category id → ERP Item Group name, creating the tree under "Zanko" as needed. */
async function syncGroups(categoryIds: Set<number>): Promise<Map<number, string>> {
  const all = await prisma.category.findMany({ select: { id: true, parentId: true, name: true } })
  const byId = new Map(all.map((c) => [c.id, c]))
  const hasChildren = new Set(all.map((c) => c.parentId).filter((x): x is number => x != null))
  const out = new Map<number, string>()

  const resolve = async (id: number): Promise<string> => {
    const done = out.get(id)
    if (done) return done
    const c = byId.get(id)!
    const parent = c.parentId != null ? await resolve(c.parentId) : ERP.itemGroupRoot
    const base = en(c.name) || `Category ${c.id}`
    let name = base
    for (const candidate of [base, `${base} (Zanko)`]) {
      name = candidate
      const found = await erpList<{ name: string; parent_item_group: string }>('Item Group', [['name', '=', candidate]], ['name', 'parent_item_group'])
      if (found.length === 0) {
        await erpInsert('Item Group', { item_group_name: candidate, parent_item_group: parent, is_group: hasChildren.has(id) ? 1 : 0 })
        break
      }
      if (found[0].parent_item_group === parent) break
    }
    out.set(id, name)
    return name
  }
  for (const id of categoryIds) await resolve(id)
  return out
}

async function ensureBrand(name: string | null, seen: Set<string>): Promise<string | null> {
  if (!name) return null
  if (seen.has(name)) return name
  const found = await erpList('Brand', [['name', '=', name]])
  if (found.length === 0) await erpInsert('Brand', { brand: name })
  seen.add(name)
  return name
}

/** Material Receipt for stock the site has but ERP does not (idempotent by ref). */
async function bookOpeningStock(variantId: number, sku: string, qty: number): Promise<void> {
  const ref = `ZK-OPEN-${variantId}`
  if ((await erpList('Stock Entry', [['zanko_order_ref', '=', ref]])).length) return
  const bins = await erpList<{ actual_qty: number }>('Bin', [['item_code', '=', sku], ['warehouse', '=', ERP.warehouse]], ['actual_qty'])
  if (bins.some((b) => Number(b.actual_qty) !== 0)) return // ERP already counts this item: it wins
  await erpInsert('Stock Entry', {
    stock_entry_type: 'Material Receipt',
    company: ERP.company,
    docstatus: 1,
    zanko_order_ref: ref,
    remarks: `Opening stock of ${sku} from zanko.uz`,
    items: [{ item_code: sku, qty, t_warehouse: ERP.warehouse, basic_rate: 0, allow_zero_valuation_rate: 1 }],
  })
}

export type EnsureResult = { created: number; updated: number; failed: { sku: string; error: string }[] }

/**
 * Default: only variants not linked yet. `all`: every variant (full re-run). `variantIds`: just these.
 * `openingStock` (default true): when a variant with site stock gets linked and ERP holds none of it,
 * book that stock into ERP (Material Receipt, ref ZK-OPEN-<variantId>) so the next reconcile does not
 * wipe it. The first export turns it off and books everything in one Stock Reconciliation instead.
 */
export async function ensureErpItems(opts: { variantIds?: number[]; all?: boolean; withImages?: boolean; openingStock?: boolean } = {}): Promise<EnsureResult> {
  const variants = await prisma.variant.findMany({
    where: opts.variantIds ? { id: { in: opts.variantIds } } : opts.all ? {} : { erpLinkedAt: null },
    include: { product: { include: { brand: true } } },
    orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  })
  const result: EnsureResult = { created: 0, updated: 0, failed: [] }
  if (variants.length === 0) return result

  const groups = await syncGroups(new Set(variants.map((v) => v.product.categoryId)))
  const ours = new Set<string>([ERP.itemGroupRoot, ...groups.values()])
  const brands = new Set<string>()
  const imageCache = new Map<string, Loaded | null>()

  for (const v of variants) {
    const p = v.product
    try {
      const brand = await ensureBrand(p.brand?.name ?? null, brands)
      const variantName = en(v.name)
      const title = en(p.title)
      const itemName = (variantName && !title.includes(variantName) ? `${title} ${variantName}` : title || v.sku).slice(0, ITEM_NAME_MAX)
      const fields = {
        item_name: itemName,
        item_group: groups.get(p.categoryId)!,
        brand,
        description: en(p.shortSpec) || itemName,
        zanko_url: `https://zanko.uz/p/${p.slug}`,
      }
      const existing = await erpList<{ name: string; image: string | null; item_group: string }>('Item', [['name', '=', v.sku]], ['name', 'image', 'item_group'])
      if (existing.length && !ours.has(existing[0].item_group)) {
        // Same code as an item of another company (e.g. Garmin): never touch it.
        throw new ErpError(`SKU ${v.sku} already exists in ERP outside Zanko (group "${existing[0].item_group}"); give the store variant a different SKU`, 0, false)
      }
      if (existing.length === 0) {
        await erpInsert('Item', {
          item_code: v.sku,
          ...fields,
          stock_uom: STOCK_UOM,
          is_stock_item: 1,
          include_item_in_manufacturing: 0,
          item_defaults: [{ company: ERP.company, default_warehouse: ERP.warehouse, default_price_list: ERP.priceList }],
        })
        result.created++
      } else {
        await erpSetValue('Item', v.sku, fields)
        result.updated++
      }

      if (opts.withImages) {
        const images = asArray(p.images).map(String)
        const attached = new Map(
          (
            await erpList<{ file_name: string; file_url: string }>(
              'File',
              [['attached_to_doctype', '=', 'Item'], ['attached_to_name', '=', v.sku]],
              ['file_name', 'file_url'],
            )
          ).map((f) => [f.file_name, f.file_url]),
        )
        const urls: string[] = []
        for (const url of images) {
          const filename = basename(url.split('?')[0])
          let fileUrl = attached.get(filename)
          if (!fileUrl) {
            if (!imageCache.has(url)) imageCache.set(url, await imageLoader(url).catch(() => null))
            const img = imageCache.get(url)
            if (!img) {
              urls.push('')
              continue
            }
            fileUrl = await erpUploadFile(img.data, img.filename, { doctype: 'Item', docname: v.sku })
            attached.set(filename, fileUrl)
          }
          urls.push(fileUrl)
        }
        const main = urls[v.imageIndex ?? 0] || urls.find(Boolean)
        const current = existing[0]?.image ?? null
        if (main && current !== main) await erpSetValue('Item', v.sku, { image: main })
      }

      const price = await erpList('Item Price', [['item_code', '=', v.sku], ['price_list', '=', ERP.priceList]])
      if (price.length === 0 && v.priceUzs > 0) {
        await erpInsert('Item Price', { item_code: v.sku, price_list: ERP.priceList, price_list_rate: v.priceUzs, currency: ERP.currency })
      }

      if (opts.openingStock !== false && !v.erpLinkedAt && v.stock > 0) await bookOpeningStock(v.id, v.sku, v.stock)

      await prisma.variant.update({ where: { id: v.id }, data: { erpLinkedAt: new Date() } })
    } catch (e) {
      result.failed.push({ sku: v.sku, error: e instanceof ErpError ? e.message : errMsg(e) })
    }
  }
  return result
}
