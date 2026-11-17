import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { createOrder, setOrderStatus } from '@/lib/orders'
import { listAddresses, saveAddress, deleteAddress, MAX_ADDRESSES } from '@/lib/account/addresses'
import { toggleFavorite, listFavorites, favoriteIds } from '@/lib/account/favorites'
import { updateProfile, signOutEverywhere, deleteAccount } from '@/lib/account/profile'
import { listAccountOrders, getAccountOrder, buyAgain } from '@/lib/account/orders'
import { createCustomerSession, customerFromToken } from '@/lib/account/session'

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }))

const saved = { ...process.env }
beforeEach(() => {
  process.env.SESSION_SECRET = 'q'.repeat(40)
})
afterEach(() => {
  process.env = { ...saved }
})

const PHONE = '+998901234567'
const OTHER = '+998907654321'
let seq = 0

async function mkAccount(phone = PHONE, o: { chat?: string; locale?: string } = {}) {
  seq++
  const account = {
    telegramUserId: `tg-${seq}`,
    telegramChatId: o.chat ?? `chat-${seq}`,
    accountLocale: o.locale ?? 'ru',
    accountCreatedAt: new Date(),
  }
  return prisma.customer.upsert({
    where: { phone },
    update: account,
    create: { phone, name: 'Aziz', region: '', tags: [], ...account },
  })
}

async function mkProduct(o: { slug: string; status?: string; stock?: number; price?: number; images?: string[] }) {
  const cat = (await prisma.category.findFirst()) ?? (await prisma.category.create({ data: { slug: 'c', name: { en: 'c' } } }))
  return prisma.product.create({
    data: {
      slug: o.slug,
      categoryId: cat.id,
      status: o.status ?? 'PUBLISHED',
      title: { en: `T ${o.slug}`, uz: `N ${o.slug}` },
      subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [], inTheBox: [], faq: [], specs: [],
      images: o.images ?? [`https://img/${o.slug}.jpg`],
      reviewed: { uz: false, ru: false },
      variants: { create: [{ sku: `SKU-${o.slug}`, name: { en: 'Black' }, priceUzs: o.price ?? 100_000, stock: o.stock ?? 10 }] },
    },
    include: { variants: true },
  })
}

const addr = (o: Partial<{ id: number; label: string; recipient: string; region: string; address: string; isDefault: boolean }> = {}) => ({
  label: 'Home',
  recipient: 'Aziz Karimov',
  region: 'tashkent-city',
  address: 'Amir Temur 1',
  isDefault: false,
  ...o,
})

// ---------------------------------------------------------------- addresses

describe('addresses', () => {
  it('stores an optional pin; a half or out-of-range pin is INVALID', async () => {
    const c = await mkAccount()
    expect(await saveAddress(c.id, { ...addr(), lat: 41.3, lng: null })).toMatchObject({ ok: false, error: 'INVALID' })
    expect(await saveAddress(c.id, { ...addr(), lat: 41.3, lng: 200 })).toMatchObject({ ok: false, error: 'INVALID' })
    const r = await saveAddress(c.id, { ...addr(), lat: 41.3110814, lng: 69.240562 })
    expect(r).toMatchObject({ ok: true })
    expect(await listAddresses(c.id)).toEqual([expect.objectContaining({ lat: 41.311081, lng: 69.240562 })])
    // editing without a pin removes it (the form always round-trips the current pin)
    await saveAddress(c.id, { ...addr(), id: (r as { id: number }).id, isDefault: true })
    expect(await listAddresses(c.id)).toEqual([expect.objectContaining({ lat: null, lng: null })])
  })

  it('validates region, label, recipient and address', async () => {
    const c = await mkAccount()
    expect(await saveAddress(c.id, addr({ region: 'mars' }))).toMatchObject({ ok: false, error: 'INVALID' })
    expect(await saveAddress(c.id, addr({ label: 'x'.repeat(41) }))).toMatchObject({ ok: false, error: 'INVALID' })
    expect(await saveAddress(c.id, addr({ recipient: 'A' }))).toMatchObject({ ok: false, error: 'INVALID' })
    expect(await saveAddress(c.id, addr({ recipient: 'A'.repeat(101) }))).toMatchObject({ ok: false, error: 'INVALID' })
    expect(await saveAddress(c.id, addr({ address: 'ab' }))).toMatchObject({ ok: false, error: 'INVALID' })
    expect(await saveAddress(c.id, addr({ address: 'a'.repeat(301) }))).toMatchObject({ ok: false, error: 'INVALID' })
    expect(await prisma.customerAddress.count()).toBe(0)
    const r = await saveAddress(c.id, addr({ label: '  Work ', recipient: ' Aziz K ' }))
    expect(r).toMatchObject({ ok: true })
    expect(await listAddresses(c.id)).toEqual([
      expect.objectContaining({ label: 'Work', recipient: 'Aziz K', region: 'tashkent-city', address: 'Amir Temur 1', isDefault: true }),
    ])
  })

  it('first address becomes default; exactly one default; a new default moves the flag', async () => {
    const c = await mkAccount()
    const a = await saveAddress(c.id, addr({ label: 'A' }))
    const b = await saveAddress(c.id, addr({ label: 'B' }))
    let list = await listAddresses(c.id)
    expect(list.filter((x) => x.isDefault).map((x) => x.label)).toEqual(['A'])
    if (!b.ok || !a.ok) throw new Error('save failed')
    await saveAddress(c.id, addr({ id: b.id, label: 'B', isDefault: true }))
    list = await listAddresses(c.id)
    expect(list.filter((x) => x.isDefault).map((x) => x.label)).toEqual(['B'])
    expect(list[0].label).toBe('B') // default first
    // un-defaulting the only default keeps one default (moves to the other address)
    await saveAddress(c.id, addr({ id: b.id, label: 'B', isDefault: false }))
    list = await listAddresses(c.id)
    expect(list.filter((x) => x.isDefault).map((x) => x.label)).toEqual(['A'])
  })

  it(`max ${MAX_ADDRESSES} addresses; editing still works at the limit`, async () => {
    const c = await mkAccount()
    let last = 0
    for (let i = 0; i < MAX_ADDRESSES; i++) {
      const r = await saveAddress(c.id, addr({ label: `L${i}` }))
      expect(r.ok).toBe(true)
      if (r.ok) last = r.id
    }
    expect(await saveAddress(c.id, addr({ label: 'one more' }))).toEqual({ ok: false, error: 'LIMIT' })
    expect(await saveAddress(c.id, addr({ id: last, label: 'edited' }))).toEqual({ ok: true, id: last })
    expect(await prisma.customerAddress.count()).toBe(MAX_ADDRESSES)
  })

  it('delete moves the default to the newest remaining address', async () => {
    const c = await mkAccount()
    const a = await saveAddress(c.id, addr({ label: 'A' }))
    await saveAddress(c.id, addr({ label: 'B' }))
    await saveAddress(c.id, addr({ label: 'C' }))
    if (!a.ok) throw new Error('save failed')
    expect(await deleteAddress(c.id, a.id)).toBe(true)
    const list = await listAddresses(c.id)
    expect(list.map((x) => [x.label, x.isDefault])).toEqual([
      ['C', true],
      ['B', false],
    ])
  })

  it("IDOR: another customer's address id -> not found, untouched", async () => {
    const mine = await mkAccount()
    const theirs = await mkAccount(OTHER)
    const r = await saveAddress(theirs.id, addr({ label: 'Theirs' }))
    if (!r.ok) throw new Error('save failed')
    expect(await saveAddress(mine.id, addr({ id: r.id, label: 'Hacked' }))).toEqual({ ok: false, error: 'NOT_FOUND' })
    expect(await deleteAddress(mine.id, r.id)).toBe(false)
    expect(await listAddresses(mine.id)).toEqual([])
    expect((await prisma.customerAddress.findUniqueOrThrow({ where: { id: r.id } })).label).toBe('Theirs')
  })
})

// ---------------------------------------------------------------- favorites

describe('favorites', () => {
  it('toggle twice; draft product refused; list returns card data', async () => {
    const c = await mkAccount()
    const p = await mkProduct({ slug: 'phone', price: 250_000 })
    const draft = await mkProduct({ slug: 'draft', status: 'DRAFT' })
    expect(await toggleFavorite(c.id, p.id)).toBe(true)
    expect(await favoriteIds(c.id)).toEqual([p.id])
    const cards = await listFavorites(c.id)
    expect(cards).toEqual([expect.objectContaining({ id: p.id, slug: 'phone', minPriceUzs: 250_000, image: 'https://img/phone.jpg', inStock: true })])
    expect(await toggleFavorite(c.id, p.id)).toBe(false)
    expect(await favoriteIds(c.id)).toEqual([])
    expect(await toggleFavorite(c.id, draft.id)).toBe(false)
    expect(await toggleFavorite(c.id, 999_999)).toBe(false)
    expect(await prisma.favorite.count()).toBe(0)
  })

  it('a product unpublished after it was favorited is hidden from the list but can be removed', async () => {
    const c = await mkAccount()
    const p = await mkProduct({ slug: 'gone' })
    await toggleFavorite(c.id, p.id)
    await prisma.product.update({ where: { id: p.id }, data: { status: 'DRAFT' } })
    expect(await listFavorites(c.id)).toEqual([])
    expect(await toggleFavorite(c.id, p.id)).toBe(false)
    expect(await prisma.favorite.count()).toBe(0)
  })

  it('IDOR: favorites are per customer', async () => {
    const a = await mkAccount()
    const b = await mkAccount(OTHER)
    const p = await mkProduct({ slug: 'x' })
    await toggleFavorite(a.id, p.id)
    expect(await favoriteIds(b.id)).toEqual([])
    expect(await listFavorites(b.id)).toEqual([])
  })
})

// ---------------------------------------------------------------- profile

describe('profile', () => {
  it('updateProfile validates name and locale', async () => {
    const c = await mkAccount()
    expect(await updateProfile(c.id, { name: 'A', locale: 'uz', notifyTelegram: true })).toEqual({ ok: false, error: 'INVALID' })
    expect(await updateProfile(c.id, { name: 'Aziz', locale: 'de' as never, notifyTelegram: true })).toEqual({ ok: false, error: 'INVALID' })
    expect(await updateProfile(c.id, { name: '  Aziz Karimov ', locale: 'en', notifyTelegram: false })).toEqual({ ok: true })
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })
    expect(row).toMatchObject({ name: 'Aziz Karimov', accountLocale: 'en', notifyTelegram: false })
  })

  it('signOutEverywhere invalidates existing sessions', async () => {
    const c = await mkAccount()
    const token = await createCustomerSession({ cid: c.id, sv: c.sessionVersion })
    expect(await customerFromToken(token)).not.toBeNull()
    await signOutEverywhere(c.id)
    expect(await customerFromToken(token)).toBeNull()
  })

  it('deleteAccount: login rows of the customer and of its Telegram user are deleted', async () => {
    const c = await mkAccount()
    const p = await mkProduct({ slug: 'p' })
    await createOrder({ lines: [{ variantId: p.variants[0].id, qty: 1 }], name: 'Aziz', phone: PHONE, region: 'tashkent-city', address: 'Amir Temur 1', locale: 'uz' }, { notify: () => {} })
    const other = await mkAccount(OTHER)
    const now = new Date()
    const login = (o: { customerId?: number; tg?: string }, n: number) =>
      prisma.customerLogin.create({
        data: { tokenHash: `h${n}`, browserHash: 'b', checkCode: '0000', expiresAt: new Date(now.getTime() + 600_000), customerId: o.customerId, pendingTelegramUserId: o.tg },
      })
    await login({ customerId: c.id, tg: c.telegramUserId! }, 1)
    await login({ tg: c.telegramUserId! }, 2) // opened in the bot, no customer attached yet
    await login({ customerId: other.id, tg: other.telegramUserId! }, 3)
    expect(await deleteAccount(c.id)).toBe(true)
    expect((await prisma.customerLogin.findMany({ select: { tokenHash: true } })).map((r) => r.tokenHash)).toEqual(['h3'])
  })

  it('deleteAccount without orders removes the Customer row entirely (privacy)', async () => {
    const c = await mkAccount()
    const p = await mkProduct({ slug: 'p' })
    await saveAddress(c.id, addr())
    await toggleFavorite(c.id, p.id)
    expect(await deleteAccount(c.id)).toBe(true)
    expect(await prisma.customer.findUnique({ where: { id: c.id } })).toBeNull()
    expect(await prisma.customerAddress.count()).toBe(0)
    expect(await prisma.favorite.count()).toBe(0)
    expect(await deleteAccount(c.id)).toBe(false)
  })

  it('deleteAccount: orders + Customer kept, link/addresses/favorites gone, old session invalid', async () => {
    const c = await mkAccount()
    const p = await mkProduct({ slug: 'p' })
    expect((await createOrder({ lines: [{ variantId: p.variants[0].id, qty: 1 }], name: 'Aziz', phone: PHONE, region: 'tashkent-city', address: 'Amir Temur 1', locale: 'uz' }, { notify: () => {} })).ok).toBe(true)
    await saveAddress(c.id, addr())
    await toggleFavorite(c.id, p.id)
    const token = await createCustomerSession({ cid: c.id, sv: c.sessionVersion })
    await deleteAccount(c.id)
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })
    expect(row).toMatchObject({ telegramUserId: null, telegramChatId: null, accountCreatedAt: null, phone: PHONE })
    expect(row.sessionVersion).toBe(c.sessionVersion + 1)
    expect(await prisma.customerAddress.count()).toBe(0)
    expect(await prisma.favorite.count()).toBe(0)
    expect(await prisma.order.count()).toBe(1)
    expect(await customerFromToken(token)).toBeNull()
  })
})

// ---------------------------------------------------------------- orders

describe('account orders', () => {
  const place = (variantId: number, qty: number, phone = PHONE) =>
    createOrder({ lines: [{ variantId, qty }], name: 'Aziz', phone, region: 'tashkent-city', address: 'Amir Temur 1', locale: 'uz' }, { notify: () => {} })

  it('lists orders placed before the account existed, newest first, never another phone', async () => {
    const p = await mkProduct({ slug: 'p' })
    const v = p.variants[0].id
    await place(v, 1) // before the account
    await place(v, 2, OTHER)
    await mkAccount()
    await place(v, 3)
    const list = await listAccountOrders(PHONE)
    expect(list.map((o) => o.number)).toEqual([1003, 1001])
    expect(list[0]).toMatchObject({ number: 1003, status: 'NEW', totalUzs: 300_000, itemsCount: 3 })
  })

  it("IDOR: another phone's order number -> null", async () => {
    const p = await mkProduct({ slug: 'p' })
    await place(p.variants[0].id, 1, OTHER)
    expect(await getAccountOrder(PHONE, 1001)).toBeNull()
    expect(await buyAgain(PHONE, 1001)).toBeNull()
    expect(await getAccountOrder(OTHER, 1001)).not.toBeNull()
  })

  it('detail: lines with current image/slug, timeline from events', async () => {
    const p = await mkProduct({ slug: 'cam', images: ['https://img/a.jpg', 'https://img/b.jpg'] })
    await place(p.variants[0].id, 2)
    const order = await prisma.order.findUniqueOrThrow({ where: { number: 1001 } })
    expect((await setOrderStatus(order.id, 'CONFIRMED')).ok).toBe(true)
    const d = await getAccountOrder(PHONE, 1001)
    expect(d).toMatchObject({ number: 1001, status: 'CONFIRMED', address: 'Amir Temur 1', region: 'tashkent-city', totalUzs: 200_000 })
    expect(d!.lines).toEqual([
      expect.objectContaining({ variantId: p.variants[0].id, qty: 2, priceUzs: 100_000, productTitle: 'N cam', variantName: 'Black', image: 'https://img/a.jpg', slug: 'cam' }),
    ])
    expect(d!.events.map((e) => [e.status, e.synthetic])).toEqual([
      ['NEW', false],
      ['CONFIRMED', false],
    ])
  })

  it('timeline: legacy order without events gets a synthetic "placed" entry', async () => {
    const p = await mkProduct({ slug: 'p' })
    await place(p.variants[0].id, 1)
    await prisma.orderStatusEvent.deleteMany()
    const d = await getAccountOrder(PHONE, 1001)
    expect(d!.events).toEqual([{ status: 'NEW', at: d!.createdAt, synthetic: true }])
  })

  it('timeline: legacy DELIVERED order without events ends with a synthetic current-status entry (at: null)', async () => {
    const p = await mkProduct({ slug: 'p' })
    await place(p.variants[0].id, 1)
    await prisma.orderStatusEvent.deleteMany()
    await prisma.order.update({ where: { number: 1001 }, data: { status: 'DELIVERED' } })
    const d = await getAccountOrder(PHONE, 1001)
    expect(d!.events).toEqual([
      { status: 'NEW', at: d!.createdAt, synthetic: true },
      { status: 'DELIVERED', at: null, synthetic: true },
    ])
    // history that already ends in the current status gets nothing extra
    const order = await prisma.order.findUniqueOrThrow({ where: { number: 1001 } })
    await prisma.orderStatusEvent.create({ data: { orderId: order.id, status: 'DELIVERED' } })
    expect((await getAccountOrder(PHONE, 1001))!.events.map((e) => [e.status, e.synthetic])).toEqual([
      ['NEW', true],
      ['DELIVERED', false],
    ])
  })

  it('buyAgain caps qty by stock and lists unpublished/deleted/sold-out variants as unavailable', async () => {
    const a = await mkProduct({ slug: 'a', stock: 10 })
    const b = await mkProduct({ slug: 'b', stock: 10 })
    const c = await mkProduct({ slug: 'c', stock: 10 })
    const d = await mkProduct({ slug: 'd', stock: 10 })
    const r = await createOrder(
      {
        lines: [
          { variantId: a.variants[0].id, qty: 5 },
          { variantId: b.variants[0].id, qty: 1 },
          { variantId: c.variants[0].id, qty: 1 },
          { variantId: d.variants[0].id, qty: 1 },
        ],
        name: 'Aziz', phone: PHONE, region: 'tashkent-city', address: 'Amir Temur 1', locale: 'uz',
      },
      { notify: () => {} },
    )
    expect(r.ok).toBe(true)
    await prisma.variant.update({ where: { id: a.variants[0].id }, data: { stock: 3 } })
    await prisma.product.update({ where: { id: b.id }, data: { status: 'DRAFT' } })
    await prisma.product.delete({ where: { id: c.id } })
    await prisma.variant.update({ where: { id: d.variants[0].id }, data: { stock: 0 } })
    const again = await buyAgain(PHONE, 1001)
    expect(again!.lines).toEqual([{ variantId: a.variants[0].id, qty: 3, stock: 3 }])
    expect(again!.unavailable.sort()).toEqual(['N b — Black', 'N c — Black', 'N d — Black'])
  })
})
