import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import { createOrder } from '@/lib/orders'
import { updateSettings } from '@/lib/settings'
import { segmentOf, listCustomers, getCustomer, updateCustomer, customersCsv } from '@/lib/customers'
import type { Staff } from '@/lib/admin/session'

const NOW = new Date('2026-11-17T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)
const VIP = 10_000_000
const staff: Staff = { id: 0, email: 'owner@shop.uz', name: 'Owner', role: 'ADMIN' }

describe('segmentOf', () => {
  it('1 order -> NEW, 2 orders -> RETURNING', () => {
    expect(segmentOf({ orders: 1, spentUzs: 100_000, lastOrderAt: daysAgo(3) }, VIP, NOW)).toBe('NEW')
    expect(segmentOf({ orders: 0, spentUzs: 0, lastOrderAt: null }, VIP, NOW)).toBe('NEW')
    expect(segmentOf({ orders: 2, spentUzs: 200_000, lastOrderAt: daysAgo(3) }, VIP, NOW)).toBe('RETURNING')
  })
  it('spent >= threshold -> VIP (inclusive), beats RETURNING', () => {
    expect(segmentOf({ orders: 2, spentUzs: 12_000_000, lastOrderAt: daysAgo(3) }, VIP, NOW)).toBe('VIP')
    expect(segmentOf({ orders: 1, spentUzs: VIP, lastOrderAt: daysAgo(3) }, VIP, NOW)).toBe('VIP')
    expect(segmentOf({ orders: 1, spentUzs: VIP - 1, lastOrderAt: daysAgo(3) }, VIP, NOW)).toBe('NEW')
  })
  it('last order more than 180 days ago -> INACTIVE, beats VIP', () => {
    expect(segmentOf({ orders: 1, spentUzs: 100_000, lastOrderAt: daysAgo(200) }, VIP, NOW)).toBe('INACTIVE')
    expect(segmentOf({ orders: 5, spentUzs: 50_000_000, lastOrderAt: daysAgo(181) }, VIP, NOW)).toBe('INACTIVE')
    expect(segmentOf({ orders: 5, spentUzs: 50_000_000, lastOrderAt: daysAgo(180) }, VIP, NOW)).toBe('VIP')
  })
})

async function mkVariant(price = 100_000, stock = 50) {
  const cat = (await prisma.category.findFirst()) ?? (await prisma.category.create({ data: { slug: 'c', name: { en: 'c' } } }))
  const p = await prisma.product.create({
    data: {
      slug: `p-${Math.random().toString(36).slice(2)}`, categoryId: cat.id, status: 'PUBLISHED', title: { en: 'T' }, subtitle: {}, shortSpec: {},
      descriptionHtml: {}, sections: [], highlights: [], inTheBox: [], faq: [], specs: [], images: [], reviewed: { uz: false, ru: false },
      variants: { create: [{ sku: `S${Math.random().toString(36).slice(2)}`, name: { en: 'Black' }, priceUzs: price, stock }] },
    },
    include: { variants: true },
  })
  return p.variants[0]
}
const base = { name: 'Ali Valiyev', region: 'tashkent-city', address: 'Amir Temur 1', locale: 'uz' as const }

describe('createOrder and customers', () => {
  it('same phone in different formats -> one Customer, name/region follow the latest order', async () => {
    const v = await mkVariant()
    const lines = [{ variantId: v.id, qty: 1 }]
    expect(await createOrder({ ...base, phone: '+998 90 123 45 67', lines })).toMatchObject({ ok: true })
    expect(await createOrder({ ...base, name: 'Ali V.', region: 'samarkand', phone: '901234567', lines })).toMatchObject({ ok: true })
    const all = await prisma.customer.findMany()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ phone: '+998901234567', name: 'Ali V.', region: 'samarkand', blocked: false, tags: [] })
  })

  it('blocked customer -> BLOCKED, no order row, stock untouched', async () => {
    const v = await mkVariant(100_000, 5)
    await prisma.customer.create({ data: { phone: '+998901234567', name: 'Bad', region: 'tashkent-city', tags: [], blocked: true } })
    const r = await createOrder({ ...base, phone: '90 123 45 67', lines: [{ variantId: v.id, qty: 99 }] })
    expect(r).toEqual({ ok: false, error: 'BLOCKED' })
    expect(await prisma.order.count()).toBe(0)
  })

  it('blocked check does not depend on stock or price validity (runs first)', async () => {
    await prisma.customer.create({ data: { phone: '+998901234567', name: 'Bad', region: 'tashkent-city', tags: [], blocked: true } })
    expect(await createOrder({ ...base, phone: '+998901234567', lines: [{ variantId: 999999, qty: 1 }] })).toEqual({ ok: false, error: 'BLOCKED' })
  })

  it('a failed order (out of stock) does not create a customer', async () => {
    const v = await mkVariant(100_000, 1)
    expect(await createOrder({ ...base, phone: '+998901234567', lines: [{ variantId: v.id, qty: 5 }] })).toEqual({ ok: false, error: 'OUT_OF_STOCK' })
    expect(await prisma.customer.count()).toBe(0)
  })
})

async function mkOrder(phone: string, status: string, total: number, at: Date, name = 'N') {
  const last = await prisma.order.aggregate({ _max: { number: true } })
  return prisma.order.create({
    data: { number: (last._max.number ?? 1000) + 1, status, name, phone, region: 'tashkent-city', address: 'addr', locale: 'uz', totalUzs: total, createdAt: at },
  })
}
const mkCustomer = (phone: string, name: string, extra: object = {}) =>
  prisma.customer.create({ data: { phone, name, region: 'tashkent-city', tags: [], ...extra } })

describe('listCustomers / getCustomer', () => {
  it('aggregates stats from CONFIRMED/DELIVERED only; lastOrderAt skips cancelled; segments use the VIP setting', async () => {
    await updateSettings({ vipThresholdUzs: 1_000_000 })
    const a = await mkCustomer('+998900000001', 'Alice')
    const b = await mkCustomer('+998900000002', 'Bob')
    await mkCustomer('+998900000003', 'Carl')
    await mkOrder('+998900000001', 'CONFIRMED', 600_000, daysAgo(10))
    await mkOrder('+998900000001', 'DELIVERED', 600_000, daysAgo(5))
    await mkOrder('+998900000001', 'CANCELLED', 9_000_000, daysAgo(1))
    await mkOrder('+998900000001', 'NEW', 50_000, daysAgo(2))
    await mkOrder('+998900000002', 'CONFIRMED', 100_000, daysAgo(300))
    const { rows, total } = await listCustomers({ page: 1 }, NOW)
    expect(total).toBe(3)
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]))
    expect(byName.Alice).toMatchObject({ id: a.id, orders: 2, spentUzs: 1_200_000, segment: 'VIP' })
    expect(byName.Alice.lastOrderAt!.getTime()).toBe(daysAgo(2).getTime())
    expect(byName.Bob).toMatchObject({ id: b.id, orders: 1, segment: 'INACTIVE' })
    expect(byName.Carl).toMatchObject({ orders: 0, spentUzs: 0, lastOrderAt: null, segment: 'NEW' })
  })

  it('search, segment filter, sort and paging', async () => {
    for (let i = 0; i < 55; i++) await mkCustomer(`+99890100${String(i).padStart(4, '0')}`, `User ${String(i).padStart(2, '0')}`)
    await mkCustomer('+998977777777', 'Zed')
    await mkOrder('+998977777777', 'CONFIRMED', 20_000_000, daysAgo(1))
    const p1 = await listCustomers({ page: 1, sort: 'name' }, NOW)
    expect(p1.total).toBe(56)
    expect(p1.rows).toHaveLength(50)
    expect(p1.rows[0].name).toBe('User 00')
    expect((await listCustomers({ page: 2, sort: 'name' }, NOW)).rows).toHaveLength(6)
    expect((await listCustomers({ page: 1, sort: 'spent' }, NOW)).rows[0].name).toBe('Zed')
    expect((await listCustomers({ page: 1, segment: 'VIP' }, NOW)).rows.map((r) => r.name)).toEqual(['Zed'])
    expect((await listCustomers({ page: 1, q: 'user 07' }, NOW)).rows.map((r) => r.name)).toEqual(['User 07'])
    expect((await listCustomers({ page: 1, q: '97 777 77 77' }, NOW)).rows.map((r) => r.name)).toEqual(['Zed'])
    expect((await listCustomers({ page: 1, segment: 'bogus' as never }, NOW)).total).toBe(56)
  })

  it('getCustomer returns the order history for the phone; unknown id -> null', async () => {
    const c = await mkCustomer('+998900000001', 'Alice')
    await mkOrder('+998900000001', 'CONFIRMED', 1000, daysAgo(2))
    await mkOrder('+998900000001', 'NEW', 2000, daysAgo(1))
    await mkOrder('+998900000009', 'NEW', 3000, daysAgo(1))
    const got = await getCustomer(c.id, NOW)
    expect(got!.history.map((o) => o.totalUzs)).toEqual([2000, 1000])
    expect(got).toMatchObject({ phone: '+998900000001', orders: 1, spentUzs: 1000 })
    expect(await getCustomer(999999, NOW)).toBeNull()
  })
})

describe('updateCustomer', () => {
  it('updates notes, tags (trimmed, deduped) and blocked, and logs activity', async () => {
    const c = await mkCustomer('+998900000001', 'Alice')
    const r = await updateCustomer(c.id, { notes: ' calls late ', tags: [' wholesale ', 'wholesale', 'vip-friend'], blocked: true }, staff)
    expect(r).toEqual({ ok: true })
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({
      notes: 'calls late', tags: ['wholesale', 'vip-friend'], blocked: true,
    })
    const log = await prisma.activityLog.findFirstOrThrow({ where: { entity: 'customer' } })
    expect(log).toMatchObject({ action: 'update', entityId: String(c.id), userEmail: 'owner@shop.uz' })
    expect(log.summary).toContain('blocked')
  })
  it('rejects bad input and unknown ids without writing', async () => {
    const c = await mkCustomer('+998900000001', 'Alice')
    expect(await updateCustomer(c.id, { notes: 'x'.repeat(2001) }, staff)).toMatchObject({ ok: false })
    expect(await updateCustomer(c.id, { tags: ['x'.repeat(31)] }, staff)).toMatchObject({ ok: false })
    expect(await updateCustomer(c.id, { tags: 'nope' as never }, staff)).toMatchObject({ ok: false })
    expect(await updateCustomer(999999, { blocked: true }, staff)).toMatchObject({ ok: false })
    expect(await prisma.activityLog.count()).toBe(0)
  })
})

describe('customersCsv', () => {
  it('has a BOM, a header, quotes cells containing ; or quotes, and neutralises formulas', async () => {
    await mkCustomer('+998900000001', 'Valiyev; Ali "Boss"', { notes: '=HYPERLINK("x")', tags: ['a', 'b'] })
    await mkOrder('+998900000001', 'CONFIRMED', 150_000, daysAgo(2))
    const csv = await customersCsv({}, NOW)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe('Name;Phone;Region;Segment;Orders;Spent (UZS);Last order;Blocked;Tags;Notes')
    expect(lines[1]).toContain('"Valiyev; Ali ""Boss"""')
    expect(lines[1]).toContain(';\t+998900000001;') // tab prefix keeps Excel from mangling the number
    expect(lines[1]).toContain(';1;150000;')
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`)
    expect(lines[1]).toContain(';a, b;')
  })
  it('Last order is the Asia/Tashkent calendar day (UTC 22:00 is already the next day)', async () => {
    await mkCustomer('+998900000001', 'Night Owl')
    await mkOrder('+998900000001', 'CONFIRMED', 1000, new Date('2026-11-10T22:00:00Z'))
    expect((await customersCsv({}, NOW)).split('\r\n')[1]).toContain(';2026-11-11;')
  })
})
