import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/db'
import { setErpFetch } from '@/lib/erp/client'
import { ensureErpItems, setImageLoader } from '@/lib/erp/items'
import { installFakeErp, type FakeErp } from './erp-fake'

let erp: FakeErp
const saved = { ...process.env }
beforeEach(() => {
  erp = installFakeErp()
  erp.add('Item Group', { name: 'Zanko', item_group_name: 'Zanko', parent_item_group: 'Все группы продуктов', is_group: 1 })
  setImageLoader(async (url) => ({ data: Buffer.from(url), filename: url.split('/').pop()!.split('?')[0] }))
})
afterEach(() => {
  setErpFetch(null)
  setImageLoader(null)
  process.env = { ...saved }
})

async function seed() {
  const audio = await prisma.category.create({ data: { slug: 'audio', name: { en: 'Audio' } } })
  const ear = await prisma.category.create({ data: { slug: 'earbuds', name: { en: 'Earbuds' }, parentId: audio.id } })
  const brand = await prisma.brand.create({ data: { name: 'Sony', slug: 'sony' } })
  return prisma.product.create({
    data: {
      slug: 'wf-1000xm5', categoryId: ear.id, brandId: brand.id, status: 'PUBLISHED',
      title: { en: 'Sony WF-1000XM5' }, subtitle: {}, shortSpec: { en: 'ANC earbuds' }, descriptionHtml: {}, sections: [], highlights: [],
      inTheBox: [], faq: [], specs: [], reviewed: {},
      images: ['https://cdn.test/a.png?v=1', 'https://cdn.test/b.png'],
      variants: {
        create: [
          { sku: 'WF1000XM5/B', name: { en: 'Black' }, priceUzs: 3_500_000, stock: 4, sortOrder: 0 },
          { sku: 'WF1000XM5/S', name: { en: 'Silver' }, priceUzs: 3_600_000, stock: 0, sortOrder: 1, imageIndex: 1 },
        ],
      },
    },
    include: { variants: true },
  })
}

describe('ensureErpItems', () => {
  it('creates groups, brand, items, photos and prices, and links the variants', async () => {
    await seed()
    const r = await ensureErpItems({ withImages: true })
    expect(r).toEqual({ created: 2, updated: 0, failed: [] })

    const groups = erp.docs('Item Group')
    expect(groups.find((g) => g.name === 'Audio')).toMatchObject({ parent_item_group: 'Zanko', is_group: 1 })
    expect(groups.find((g) => g.name === 'Earbuds')).toMatchObject({ parent_item_group: 'Audio', is_group: 0 })
    expect(erp.docs('Brand').map((b) => b.name)).toEqual(['Sony'])

    const item = erp.docs('Item').find((i) => i.name === 'WF1000XM5/B')!
    expect(item).toMatchObject({
      item_code: 'WF1000XM5/B', item_name: 'Sony WF-1000XM5 Black', item_group: 'Earbuds', brand: 'Sony', stock_uom: 'Кол-во',
      is_stock_item: 1, description: 'ANC earbuds', zanko_url: 'https://zanko.uz/p/wf-1000xm5', image: '/files/a.png',
      item_defaults: [{ company: 'Zanko', default_warehouse: 'Stores - Z', default_price_list: 'Zanko Retail' }],
    })
    expect(erp.docs('Item').find((i) => i.name === 'WF1000XM5/S')!.image).toBe('/files/b.png')
    expect(erp.docs('File').filter((f) => f.attached_to_name === 'WF1000XM5/B').map((f) => f.file_name)).toEqual(['a.png', 'b.png'])
    expect(erp.docs('Item Price').map((p) => [p.item_code, p.price_list, p.price_list_rate])).toEqual([
      ['WF1000XM5/B', 'Zanko Retail', 3_500_000],
      ['WF1000XM5/S', 'Zanko Retail', 3_600_000],
    ])
    expect((await prisma.variant.findMany()).every((v) => v.erpLinkedAt)).toBe(true)
  })

  it('is idempotent: a second run creates nothing new', async () => {
    await seed()
    await ensureErpItems({ withImages: true })
    const r = await ensureErpItems({ all: true, withImages: true })
    expect(r).toEqual({ created: 0, updated: 2, failed: [] })
    expect(erp.docs('Item')).toHaveLength(2)
    expect(erp.docs('File')).toHaveLength(4)
    expect(erp.docs('Item Price')).toHaveLength(2)
    expect(erp.docs('Item Group')).toHaveLength(3)
  })

  it('never overwrites a price that already exists in ERP', async () => {
    await seed()
    erp.add('Item Price', { item_code: 'WF1000XM5/B', price_list: 'Zanko Retail', price_list_rate: 999 })
    await ensureErpItems({})
    expect(erp.docs('Item Price').filter((p) => p.item_code === 'WF1000XM5/B').map((p) => p.price_list_rate)).toEqual([999])
  })

  it('by default only handles variants not linked yet', async () => {
    const p = await seed()
    await prisma.variant.update({ where: { id: p.variants[0].id }, data: { erpLinkedAt: new Date() } })
    const r = await ensureErpItems({})
    expect(r.created).toBe(1)
    expect(erp.docs('Item').map((i) => i.name)).toEqual(['WF1000XM5/S'])
  })

  it('one failing SKU does not stop the others', async () => {
    await seed()
    erp.intercept = (method, path, body) =>
      method === 'POST' && path === '/api/resource/Item' && (body as { item_code: string }).item_code === 'WF1000XM5/B'
        ? new Response(JSON.stringify({ exc_type: 'ValidationError', exception: 'bad item' }), { status: 417 })
        : null
    const r = await ensureErpItems({})
    expect(r.created).toBe(1)
    expect(r.failed).toEqual([{ sku: 'WF1000XM5/B', error: 'bad item' }])
    const vs = await prisma.variant.findMany({ orderBy: { sortOrder: 'asc' } })
    expect(vs.map((v) => !!v.erpLinkedAt)).toEqual([false, true])
  })

  it('uses a suffixed group name when a non-Zanko group already has that name', async () => {
    await seed()
    erp.add('Item Group', { name: 'Audio', item_group_name: 'Audio', parent_item_group: 'Все группы продуктов', is_group: 0 })
    await ensureErpItems({})
    expect(erp.docs('Item Group').find((g) => g.name === 'Audio (Zanko)')).toMatchObject({ parent_item_group: 'Zanko' })
    expect(erp.docs('Item Group').find((g) => g.name === 'Earbuds')).toMatchObject({ parent_item_group: 'Audio (Zanko)' })
  })

  it('linking a SKU that has stock on the site books that stock into ERP once (unless told not to)', async () => {
    const p = await seed() // WF1000XM5/B has stock 4
    await ensureErpItems({})
    const se = erp.docs('Stock Entry')
    expect(se).toHaveLength(1)
    expect(se[0]).toMatchObject({ stock_entry_type: 'Material Receipt', company: 'Zanko', docstatus: 1, zanko_order_ref: `ZK-OPEN-${p.variants[0].id}` })
    expect(se[0].items).toEqual([{ item_code: 'WF1000XM5/B', qty: 4, t_warehouse: 'Stores - Z', basic_rate: 0, allow_zero_valuation_rate: 1 }])
    await prisma.variant.updateMany({ data: { erpLinkedAt: null } })
    await ensureErpItems({})
    expect(erp.docs('Stock Entry')).toHaveLength(1)
  })

  it('no opening receipt when ERP already holds stock for the item, or when the export does its own', async () => {
    await seed()
    erp.add('Bin', { item_code: 'WF1000XM5/B', warehouse: 'Stores - Z', actual_qty: 2 })
    await ensureErpItems({})
    expect(erp.docs('Stock Entry')).toHaveLength(0)
  })

  it('openingStock:false skips the receipt', async () => {
    await seed()
    await ensureErpItems({ openingStock: false })
    expect(erp.docs('Stock Entry')).toHaveLength(0)
  })

  it('refuses to adopt an ERP item that belongs to another company (e.g. a Garmin code)', async () => {
    await seed()
    erp.add('Item', { name: 'WF1000XM5/B', item_code: 'WF1000XM5/B', item_group: 'Продукты', item_name: 'Garmin thing' })
    const r = await ensureErpItems({})
    expect(r.failed).toEqual([{ sku: 'WF1000XM5/B', error: expect.stringContaining('outside Zanko') }])
    expect(erp.docs('Item').find((i) => i.name === 'WF1000XM5/B')!.item_name).toBe('Garmin thing')
    expect((await prisma.variant.findUniqueOrThrow({ where: { sku: 'WF1000XM5/B' } })).erpLinkedAt).toBeNull()
  })
})
