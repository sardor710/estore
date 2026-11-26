import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/db'
import { setErpFetch } from '@/lib/erp/client'
import { drainOutbox, retryOutbox } from '@/lib/erp/outbox'
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

const line = [{ sku: 'A1', qty: 2, rateUzs: 1000 }]
const mk = (data: { ref: string; kind: string; orderId?: number; status?: string; erpDoc?: string }) =>
  prisma.erpOutbox.create({ data: { orderId: 7, lines: line, ...data } })
const posts = (path: string) => erp.calls.filter((c) => c.method === 'POST' && c.path === path)

describe('drainOutbox', () => {
  it('DELIVER → submitted Delivery Note, row DONE with the ERP name', async () => {
    await mk({ ref: 'ZK-7', kind: 'DELIVER' })
    expect(await drainOutbox()).toEqual({ done: 1, failed: 0, pending: 0 })
    const dn = erp.docs('Delivery Note')[0]
    expect(dn).toMatchObject({
      customer: 'zanko.uz Website', company: 'Zanko', docstatus: 1, zanko_order_ref: 'ZK-7', set_warehouse: 'Stores - Z',
      selling_price_list: 'Zanko Retail', currency: 'UZS',
    })
    expect(dn.items).toEqual([{ item_code: 'A1', qty: 2, rate: 1000, warehouse: 'Stores - Z', allow_zero_valuation_rate: 1 }])
    expect(await prisma.erpOutbox.findUnique({ where: { ref: 'ZK-7' } })).toMatchObject({ status: 'DONE', erpDoc: dn.name })
  })

  it('RETURN → return Delivery Note against the original', async () => {
    await mk({ ref: 'ZK-7', kind: 'DELIVER', status: 'DONE', erpDoc: 'DN-1' })
    await mk({ ref: 'ZK-7-R', kind: 'RETURN' })
    await drainOutbox()
    expect(erp.docs('Delivery Note')[0]).toMatchObject({ is_return: 1, return_against: 'DN-1', docstatus: 1, zanko_order_ref: 'ZK-7-R' })
    expect((erp.docs('Delivery Note')[0].items as { qty: number }[])[0].qty).toBe(-2)
  })

  it('RETURN waits while its DELIVER is being pushed right now', async () => {
    await mk({ ref: 'ZK-7', kind: 'DELIVER', status: 'RUNNING' })
    await prisma.erpOutbox.update({ where: { ref: 'ZK-7' }, data: { lockedUntil: new Date(Date.now() + 60_000) } })
    await mk({ ref: 'ZK-7-R', kind: 'RETURN' })
    await drainOutbox()
    expect(erp.docs('Delivery Note')).toHaveLength(0)
    expect(await prisma.erpOutbox.findUnique({ where: { ref: 'ZK-7-R' } })).toMatchObject({ status: 'PENDING', attempts: 1 })
  })

  it('RECEIPT → submitted Material Receipt into the Zanko warehouse', async () => {
    await mk({ ref: 'ZK-7-R', kind: 'RECEIPT' })
    await drainOutbox()
    expect(erp.docs('Stock Entry')[0]).toMatchObject({ stock_entry_type: 'Material Receipt', company: 'Zanko', docstatus: 1, zanko_order_ref: 'ZK-7-R' })
    expect(erp.docs('Stock Entry')[0].items).toEqual([{ item_code: 'A1', qty: 2, t_warehouse: 'Stores - Z', basic_rate: 0, allow_zero_valuation_rate: 1 }])
  })

  it('a document that already exists in ERP (earlier timeout) is adopted, not created again', async () => {
    erp.add('Delivery Note', { name: 'DN-OLD', zanko_order_ref: 'ZK-7', docstatus: 1 })
    await mk({ ref: 'ZK-7', kind: 'DELIVER' })
    await drainOutbox()
    expect(posts('/api/resource/Delivery Note')).toHaveLength(0)
    expect(await prisma.erpOutbox.findUnique({ where: { ref: 'ZK-7' } })).toMatchObject({ status: 'DONE', erpDoc: 'DN-OLD' })
  })

  it('ERP down (503) → stays PENDING with backoff', async () => {
    await mk({ ref: 'ZK-7', kind: 'DELIVER' })
    erp.intercept = () => new Response('down', { status: 503 })
    const t0 = new Date()
    expect(await drainOutbox(t0)).toEqual({ done: 0, failed: 0, pending: 1 })
    const row = (await prisma.erpOutbox.findUnique({ where: { ref: 'ZK-7' } }))!
    expect(row).toMatchObject({ status: 'PENDING', attempts: 1 })
    expect(row.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(t0.getTime() + 2 * 60_000)
    expect(row.lastError).toContain('503')
    // not retried before its time
    erp.intercept = null
    expect(await drainOutbox(t0)).toEqual({ done: 0, failed: 0, pending: 1 })
    expect(erp.docs('Delivery Note')).toHaveLength(0)
    // retried after
    expect(await drainOutbox(new Date(t0.getTime() + 3 * 60_000))).toEqual({ done: 1, failed: 0, pending: 0 })
  })

  it('a validation error (e.g. not enough stock in ERP) → FAILED with the message; retryOutbox re-queues it', async () => {
    const row = await mk({ ref: 'ZK-7', kind: 'DELIVER' })
    erp.intercept = (m, p) =>
      m === 'POST' && p === '/api/resource/Delivery Note'
        ? new Response(JSON.stringify({ exc_type: 'NegativeStockError', exception: '2 units of A1 needed' }), { status: 417 })
        : null
    expect(await drainOutbox()).toEqual({ done: 0, failed: 1, pending: 0 })
    expect(await prisma.erpOutbox.findUnique({ where: { id: row.id } })).toMatchObject({ status: 'FAILED', lastError: '2 units of A1 needed' })
    erp.intercept = null
    expect(await retryOutbox(row.id)).toBe(true)
    expect(await drainOutbox()).toEqual({ done: 1, failed: 0, pending: 0 })
  })

  it('two drains at once push once', async () => {
    await mk({ ref: 'ZK-7', kind: 'DELIVER' })
    await Promise.all([drainOutbox(), drainOutbox()])
    expect(posts('/api/resource/Delivery Note')).toHaveLength(1)
    expect(erp.docs('Delivery Note')).toHaveLength(1)
  })

  it('does nothing when the ERP is not configured', async () => {
    delete process.env.ERP_API_KEY
    await mk({ ref: 'ZK-7', kind: 'DELIVER' })
    expect(await drainOutbox()).toEqual({ done: 0, failed: 0, pending: 1 })
    expect(await prisma.erpOutbox.findUnique({ where: { ref: 'ZK-7' } })).toMatchObject({ status: 'PENDING', attempts: 0 })
  })

  it('RETURN whose DELIVER is not DONE but exists in ERP (earlier timeout): adopts it and returns', async () => {
    await mk({ ref: 'ZK-7', kind: 'DELIVER' })
    await prisma.erpOutbox.update({ where: { ref: 'ZK-7' }, data: { attempts: 1, nextAttemptAt: new Date(Date.now() + 3_600_000) } })
    erp.add('Delivery Note', { name: 'DN-TIMEOUT', zanko_order_ref: 'ZK-7', docstatus: 1 })
    await mk({ ref: 'ZK-7-R', kind: 'RETURN' })
    await drainOutbox()
    expect(await prisma.erpOutbox.findUnique({ where: { ref: 'ZK-7' } })).toMatchObject({ status: 'DONE', erpDoc: 'DN-TIMEOUT' })
    expect(erp.docs('Delivery Note').find((d) => d.zanko_order_ref === 'ZK-7-R')).toMatchObject({ return_against: 'DN-TIMEOUT' })
  })

  it('RETURN whose DELIVER never reached ERP (FAILED, not in ERP): both are skipped, nothing pushed', async () => {
    await mk({ ref: 'ZK-7', kind: 'DELIVER', status: 'FAILED' })
    await mk({ ref: 'ZK-7-R', kind: 'RETURN' })
    await drainOutbox()
    expect(erp.docs('Delivery Note')).toHaveLength(0)
    expect((await prisma.erpOutbox.findMany({ orderBy: { id: 'asc' } })).map((r) => r.status)).toEqual(['SKIPPED', 'SKIPPED'])
  })

  it('an unexpected (non-ERP) error is retried, not marked FAILED', async () => {
    await mk({ ref: 'ZK-7', kind: 'DELIVER' })
    // the timeout fires while the body is being read (after ERP may have committed)
    erp.intercept = () =>
      ({ ok: true, status: 200, text: () => Promise.reject(new DOMException('The operation was aborted', 'AbortError')) }) as unknown as Response
    await drainOutbox()
    expect(await prisma.erpOutbox.findUnique({ where: { ref: 'ZK-7' } })).toMatchObject({ status: 'PENDING', attempts: 1 })
  })

  it('a drain that lost its lock does not overwrite the newer result', async () => {
    const row = await mk({ ref: 'ZK-7', kind: 'DELIVER' })
    erp.intercept = (m, p) => {
      if (m === 'POST' && p === '/api/resource/Delivery Note') {
        // meanwhile another drain took over (after this lock expired) and finished the row
        return (async () => {
          await prisma.erpOutbox.update({ where: { id: row.id }, data: { status: 'DONE', erpDoc: 'DN-OTHER', lockedUntil: null } })
          return new Response('slow', { status: 503 })
        })()
      }
      return null
    }
    await drainOutbox()
    expect(await prisma.erpOutbox.findUnique({ where: { id: row.id } })).toMatchObject({ status: 'DONE', erpDoc: 'DN-OTHER' })
  })

  it('after a push, the SKUs are refreshed from ERP right away', async () => {
    const cat = await prisma.category.create({ data: { slug: 'c', name: { en: 'c' } } })
    await prisma.product.create({
      data: {
        slug: 'p', categoryId: cat.id, title: { en: 'P' }, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [],
        inTheBox: [], faq: [], specs: [], images: [], reviewed: {},
        variants: { create: [{ sku: 'A1', name: { en: 'A1' }, priceUzs: 1000, stock: 3, erpLinkedAt: new Date() }] },
      },
    })
    erp.add('Item', { name: 'A1', item_code: 'A1' })
    erp.add('Bin', { item_code: 'A1', warehouse: 'Stores - Z', actual_qty: 1 }) // ERP after the DN
    await mk({ ref: 'ZK-7', kind: 'DELIVER' })
    await drainOutbox()
    expect((await prisma.variant.findUniqueOrThrow({ where: { sku: 'A1' } })).stock).toBe(1)
  })
})
