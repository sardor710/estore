import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/db'
import { setErpFetch } from '@/lib/erp/client'
import { refreshFromErp } from '@/lib/erp/apply'
import { installFakeErp, type FakeErp } from './erp-fake'

let erp: FakeErp
const saved = { ...process.env }
beforeEach(() => {
  erp = installFakeErp()
  process.env.ERP_ENABLED = '1'
})
afterEach(() => {
  setErpFetch(null)
  process.env = { ...saved }
})

async function seed(vs: { sku: string; stock: number; price: number; linked?: boolean }[]) {
  const cat = await prisma.category.create({ data: { slug: 'c', name: { en: 'c' } } })
  await prisma.product.create({
    data: {
      slug: 'p', categoryId: cat.id, title: { en: 'P' }, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [],
      inTheBox: [], faq: [], specs: [], images: [], reviewed: {},
      variants: { create: vs.map((v, i) => ({ sku: v.sku, name: { en: v.sku }, priceUzs: v.price, stock: v.stock, sortOrder: i, erpLinkedAt: v.linked === false ? null : new Date() })) },
    },
  })
  for (const v of vs) erp.add('Item', { name: v.sku, item_code: v.sku })
}
const variant = async (sku: string) => (await prisma.variant.findUniqueOrThrow({ where: { sku } }))
const bin = (sku: string, qty: number) => erp.add('Bin', { item_code: sku, warehouse: 'Stores - Z', actual_qty: qty })
const price = (sku: string, rate: number) => erp.add('Item Price', { item_code: sku, price_list: 'Zanko Retail', price_list_rate: rate })

describe('refreshFromErp', () => {
  it('copies ERP stock and price onto linked variants', async () => {
    await seed([{ sku: 'A', stock: 0, price: 100 }, { sku: 'B', stock: 9, price: 200 }])
    bin('A', 5)
    price('A', 150)
    price('B', 200)
    const r = await refreshFromErp()
    expect(r).toMatchObject({ stockChanged: 2, priceChanged: 1, missingInErp: [], missingPrice: [] })
    expect(await variant('A')).toMatchObject({ stock: 5, priceUzs: 150 })
    expect((await variant('B')).stock).toBe(0) // no Bin row = nothing in stock
  })

  it('keeps the deduction of a confirmation the ERP has not received yet', async () => {
    await seed([{ sku: 'A', stock: 3, price: 100 }])
    bin('A', 5)
    price('A', 100)
    await prisma.erpOutbox.create({ data: { ref: 'ZK-1', kind: 'DELIVER', orderId: 1, lines: [{ sku: 'A', qty: 2, rateUzs: 100 }] } })
    await refreshFromErp()
    expect((await variant('A')).stock).toBe(3)
  })

  it('a missing ERP price is reported, never zeroed', async () => {
    await seed([{ sku: 'A', stock: 0, price: 100 }])
    bin('A', 1)
    const r = await refreshFromErp()
    expect(r.missingPrice).toEqual(['A'])
    expect((await variant('A')).priceUzs).toBe(100)
  })

  it('a SKU missing in ERP is reported and left untouched', async () => {
    await seed([{ sku: 'A', stock: 4, price: 100 }])
    erp.db.set('Item', [])
    const r = await refreshFromErp()
    expect(r.missingInErp).toEqual(['A'])
    expect((await variant('A')).stock).toBe(4)
  })

  it('ignores variants not linked to ERP', async () => {
    await seed([{ sku: 'A', stock: 4, price: 100, linked: false }])
    bin('A', 9)
    await refreshFromErp()
    expect((await variant('A')).stock).toBe(4)
  })

  it('can refresh just some SKUs', async () => {
    await seed([{ sku: 'A', stock: 0, price: 100 }, { sku: 'B', stock: 0, price: 100 }])
    bin('A', 2)
    bin('B', 2)
    await refreshFromErp(['A'])
    expect((await variant('A')).stock).toBe(2)
    expect((await variant('B')).stock).toBe(0)
  })

  it('a full refresh records when it ran', async () => {
    await seed([{ sku: 'A', stock: 0, price: 100 }])
    await refreshFromErp()
    const s = await prisma.setting.findUnique({ where: { key: 'erp.lastReconcileAt' } })
    expect(s).not.toBeNull()
    expect(Date.now() - new Date(s!.value).getTime()).toBeLessThan(10_000)
  })

  it('a delivery finishing while ERP is being read is not counted back (no phantom stock)', async () => {
    await seed([{ sku: 'A', stock: 3, price: 100 }])
    bin('A', 5) // ERP before the Delivery Note
    price('A', 100)
    const row = await prisma.erpOutbox.create({ data: { ref: 'ZK-1', kind: 'DELIVER', orderId: 1, lines: [{ sku: 'A', qty: 2, rateUzs: 100 }] } })
    erp.intercept = (m, p) => {
      if (m === 'GET' && p === '/api/resource/Bin') {
        // a drain pushes the note and marks the row DONE in between
        return (async () => {
          await prisma.erpOutbox.update({ where: { id: row.id }, data: { status: 'DONE', erpDoc: 'DN-1' } })
          return null
        })()
      }
      return null
    }
    await refreshFromErp()
    expect((await variant('A')).stock).toBeLessThanOrEqual(3)
  })
})
