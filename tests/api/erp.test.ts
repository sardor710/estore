import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { prisma } from '@/lib/db'
import { setErpFetch } from '@/lib/erp/client'
import { POST as webhookPOST } from '@/app/api/erp/webhook/route'
import { POST as syncPOST } from '@/app/api/erp/sync/route'
import { installFakeErp, type FakeErp } from '../lib/erp-fake'

let erp: FakeErp
const saved = { ...process.env }
beforeEach(() => {
  erp = installFakeErp()
  process.env.ERP_ENABLED = '1'
  process.env.ERP_WEBHOOK_SECRET = 'whsec'
  process.env.ERP_SYNC_TOKEN = 'synctok'
})
afterEach(() => {
  setErpFetch(null)
  process.env = { ...saved }
})

async function linked(sku: string, stock: number) {
  const cat = await prisma.category.create({ data: { slug: `c-${sku}`, name: { en: 'c' } } })
  await prisma.product.create({
    data: {
      slug: `p-${sku}`, categoryId: cat.id, title: { en: 'P' }, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [],
      inTheBox: [], faq: [], specs: [], images: [], reviewed: {},
      variants: { create: [{ sku, name: { en: sku }, priceUzs: 100, stock, erpLinkedAt: new Date() }] },
    },
  })
  erp.add('Item', { name: sku, item_code: sku })
  erp.add('Item Price', { item_code: sku, price_list: 'Zanko Retail', price_list_rate: 100 })
}
function hook(body: string, sig?: string) {
  const s = sig ?? createHmac('sha256', 'whsec').update(body).digest('base64')
  return webhookPOST(new Request('http://x/api/erp/webhook', { method: 'POST', body, headers: { 'x-frappe-webhook-signature': s } }))
}
const sync = (auth?: string, q = '') =>
  syncPOST(new Request(`http://x/api/erp/sync${q}`, { method: 'POST', headers: auth ? { authorization: auth } : {} }))

describe('POST /api/erp/webhook', () => {
  it('a signed stock event updates that SKU from ERP', async () => {
    await linked('WF1000XM5/B', 0)
    erp.add('Bin', { item_code: 'WF1000XM5/B', warehouse: 'Stores - Z', actual_qty: 7 })
    const res = await hook('{"type":"stock","item_code":"WF1000XM5/B"}')
    expect(res.status).toBe(200)
    expect((await prisma.variant.findUniqueOrThrow({ where: { sku: 'WF1000XM5/B' } })).stock).toBe(7)
  })
  it('a bad signature is refused and changes nothing', async () => {
    await linked('A', 0)
    erp.add('Bin', { item_code: 'A', warehouse: 'Stores - Z', actual_qty: 7 })
    expect((await hook('{"type":"stock","item_code":"A"}', 'AAAA')).status).toBe(401)
    expect((await hook('{"type":"stock","item_code":"A"}', '')).status).toBe(401)
    expect((await prisma.variant.findUniqueOrThrow({ where: { sku: 'A' } })).stock).toBe(0)
  })
  it('a body without item_code is a 400', async () => {
    expect((await hook('{"type":"stock"}')).status).toBe(400)
  })
})

describe('POST /api/erp/sync', () => {
  it('needs the bearer token', async () => {
    expect((await sync()).status).toBe(401)
    expect((await sync('Bearer wrong')).status).toBe(401)
  })
  it('drains the outbox and reconciles all SKUs', async () => {
    await linked('A', 9)
    erp.add('Bin', { item_code: 'A', warehouse: 'Stores - Z', actual_qty: 4 })
    await prisma.erpOutbox.create({ data: { ref: 'ZK-1', kind: 'DELIVER', orderId: 1, lines: [{ sku: 'A', qty: 1, rateUzs: 100 }] } })
    const res = await sync('Bearer synctok')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.outbox).toEqual({ done: 1, failed: 0, pending: 0 })
    expect(body.reconcile).not.toBeNull() // the drain already refreshed A right after its push
    // the fake ERP does not move Bins on a Delivery Note; with the DN pushed, site = ERP qty
    expect((await prisma.variant.findUniqueOrThrow({ where: { sku: 'A' } })).stock).toBe(4)
  })
  it('skips the reconcile when the last one is under 5 minutes old (unless full=1)', async () => {
    await linked('A', 9)
    await prisma.setting.create({ data: { key: 'erp.lastReconcileAt', value: new Date().toISOString() } })
    expect((await (await sync('Bearer synctok')).json()).reconcile).toBeNull()
    expect((await (await sync('Bearer synctok', '?full=1')).json()).reconcile).not.toBeNull()
  })
  it('does nothing while the flag is off', async () => {
    delete process.env.ERP_ENABLED
    expect(await (await sync('Bearer synctok')).json()).toEqual({ ok: true, skipped: 'disabled' })
  })
  it('a failing item export does not stop the reconcile', async () => {
    await linked('A', 9)
    erp.add('Bin', { item_code: 'A', warehouse: 'Stores - Z', actual_qty: 4 })
    const cat = await prisma.category.create({ data: { slug: 'newcat', name: { en: 'New cat' } } })
    await prisma.product.create({
      data: {
        slug: 'p-new', categoryId: cat.id, title: { en: 'N' }, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [],
        inTheBox: [], faq: [], specs: [], images: [], reviewed: {},
        variants: { create: [{ sku: 'NEW1', name: { en: 'n' }, priceUzs: 100, stock: 0 }] },
      },
    })
    erp.intercept = (m, p) => (m === 'POST' && p === '/api/resource/Item Group' ? new Response(JSON.stringify({ exc_type: 'NameError' }), { status: 417 }) : null)
    const body = await (await sync('Bearer synctok', '?full=1')).json()
    expect(body.reconcile).toMatchObject({ stockChanged: 1 })
    expect(body.items).toMatchObject({ error: expect.any(String) })
    expect((await prisma.variant.findUniqueOrThrow({ where: { sku: 'A' } })).stock).toBe(4)
  })
})
