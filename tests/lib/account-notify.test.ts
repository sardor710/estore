import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/db'
import { updateSettings } from '@/lib/settings'
import { setOrderStatus } from '@/lib/orders'
import { notifyOrderStatus, notifyOrderPlaced } from '@/lib/account/notify'

type Call = { url: string; body: { chat_id: string; text: string; reply_markup?: { inline_keyboard: { text: string; url?: string; web_app?: { url: string } }[][] } } }

function fakeFetch(o: { fail?: 'throw' | 'http' } = {}) {
  const calls: Call[] = []
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    if (o.fail === 'throw') throw new Error('network down')
    if (o.fail === 'http') return new Response(JSON.stringify({ ok: false, description: 'Forbidden: bot was blocked by the user' }), { status: 403 })
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 })
  }) as unknown as typeof fetch
  return { calls, impl }
}

beforeEach(async () => {
  await updateSettings({ telegramBotToken: '123:abc' })
})

async function mkOrder(o: { phone?: string; locale?: string; status?: string } = {}) {
  return prisma.order.create({
    data: {
      number: 1001 + (await prisma.order.count()),
      name: 'Aziz',
      phone: o.phone ?? '+998901234567',
      region: 'tashkent-city',
      address: 'Amir Temur 1',
      locale: o.locale ?? 'ru',
      totalUzs: 100,
      status: o.status ?? 'CONFIRMED',
    },
  })
}

async function mkAccount(o: { notify?: boolean; account?: boolean; chat?: string | null } = {}) {
  return prisma.customer.create({
    data: {
      phone: '+998901234567',
      name: 'Aziz',
      region: '',
      tags: [],
      telegramUserId: 'tg1',
      telegramChatId: o.chat === undefined ? '777' : o.chat,
      notifyTelegram: o.notify ?? true,
      accountCreatedAt: o.account === false ? null : new Date(),
    },
  })
}

describe('notifyOrderStatus', () => {
  it('linked customer -> message in the order locale with a link button to the account order page', async () => {
    await mkAccount()
    const order = await mkOrder({ locale: 'ru', status: 'CONFIRMED' })
    const f = fakeFetch()
    expect(await notifyOrderStatus(order.id, undefined, { fetchImpl: f.impl, siteUrl: 'https://shop.uz/' })).toBe('sent')
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0].url).toBe('https://api.telegram.org/bot123:abc/sendMessage')
    expect(f.calls[0].body.chat_id).toBe('777')
    expect(f.calls[0].body.text).toContain('1001')
    expect(f.calls[0].body.text).toContain('подтверждён')
    // https site -> the button opens the order inside the Telegram Mini App, entering through /tg (sign-in check)
    expect(f.calls[0].body.reply_markup!.inline_keyboard[0][0]).toEqual({
      text: 'Открыть заказ',
      web_app: { url: 'https://shop.uz/tg?next=%2Fru%2Faccount%2Forders%2F1001' },
    })
  })

  it('http site (local dev) -> plain link button (Telegram opens web_app only over https)', async () => {
    await mkAccount()
    const order = await mkOrder({ locale: 'ru' })
    const f = fakeFetch()
    await notifyOrderStatus(order.id, undefined, { fetchImpl: f.impl, siteUrl: 'http://localhost:3000' })
    expect(f.calls[0].body.reply_markup!.inline_keyboard[0][0]).toEqual({ text: 'Открыть заказ', url: 'http://localhost:3000/ru/account/orders/1001' })
  })

  it('SHIPPING (out for delivery) copy in uz, ru and en', async () => {
    await mkAccount()
    const f = fakeFetch()
    for (const locale of ['uz', 'ru', 'en']) {
      const o = await mkOrder({ locale, status: 'SHIPPING' })
      await notifyOrderStatus(o.id, 'SHIPPING', { fetchImpl: f.impl, siteUrl: '' })
    }
    expect(f.calls.map((c) => c.body.text)).toEqual([
      expect.stringContaining('yo‘lga chiqdi'),
      expect.stringContaining('передан курьеру'),
      expect.stringContaining('out for delivery'),
    ])
  })

  it('uz and en copy; no SITE_URL -> no button', async () => {
    await mkAccount()
    const uz = await mkOrder({ locale: 'uz', status: 'DELIVERED' })
    const en = await mkOrder({ locale: 'en', status: 'CANCELLED' })
    const f = fakeFetch()
    expect(await notifyOrderStatus(uz.id, undefined, { fetchImpl: f.impl, siteUrl: '' })).toBe('sent')
    expect(await notifyOrderStatus(en.id, undefined, { fetchImpl: f.impl, siteUrl: '' })).toBe('sent')
    expect(f.calls[0].body.text).toMatch(/1001.*yetkazildi/s)
    expect(f.calls[1].body.text).toMatch(/1002.*cancelled/s)
    expect(f.calls[0].body.reply_markup).toBeUndefined()
  })

  it('skipped: notifications off, no account, no linked chat, other phone, unknown order', async () => {
    const f = fakeFetch()
    const c = await mkAccount({ notify: false })
    const order = await mkOrder()
    expect(await notifyOrderStatus(order.id, undefined, { fetchImpl: f.impl })).toBe('skipped')
    await prisma.customer.update({ where: { id: c.id }, data: { notifyTelegram: true, accountCreatedAt: null } })
    expect(await notifyOrderStatus(order.id, undefined, { fetchImpl: f.impl })).toBe('skipped')
    await prisma.customer.update({ where: { id: c.id }, data: { accountCreatedAt: new Date(), telegramChatId: null } })
    expect(await notifyOrderStatus(order.id, undefined, { fetchImpl: f.impl })).toBe('skipped')
    const other = await mkOrder({ phone: '+998907654321' })
    expect(await notifyOrderStatus(other.id, undefined, { fetchImpl: f.impl })).toBe('skipped')
    expect(await notifyOrderStatus(424242, undefined, { fetchImpl: f.impl })).toBe('skipped')
    expect(f.calls).toHaveLength(0)
  })

  it('`to` given -> the message uses that status, not a re-read of the order (status may have moved on)', async () => {
    await mkAccount()
    const order = await mkOrder({ locale: 'en', status: 'DELIVERED' })
    const f = fakeFetch()
    expect(await notifyOrderStatus(order.id, 'CONFIRMED', { fetchImpl: f.impl, siteUrl: '' })).toBe('sent')
    expect(f.calls[0].body.text).toMatch(/1001.*confirmed/s)
    expect(f.calls[0].body.text).not.toContain('delivered')
  })

  it('Telegram down or bot blocked -> "failed", never throws; the status change itself is unaffected', async () => {
    await mkAccount()
    const order = await mkOrder({ status: 'NEW' })
    expect(await setOrderStatus(order.id, 'CANCELLED')).toEqual({ ok: true })
    expect(await notifyOrderStatus(order.id, undefined, { fetchImpl: fakeFetch({ fail: 'throw' }).impl })).toBe('failed')
    expect(await notifyOrderStatus(order.id, undefined, { fetchImpl: fakeFetch({ fail: 'http' }).impl })).toBe('failed')
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('CANCELLED')
  })
})


describe('notifyOrderPlaced', () => {
  async function placed(locale = 'en') {
    const o = await mkOrder({ locale, status: 'NEW' })
    await prisma.orderLine.createMany({
      data: [
        { orderId: o.id, variantId: 1, sku: 'A', productTitle: 'Charger', variantName: '', priceUzs: 50, qty: 2 },
        { orderId: o.id, variantId: 2, sku: 'B', productTitle: 'Cable', variantName: '', priceUzs: 1_150_000, qty: 1 },
      ],
    })
    await prisma.order.update({ where: { id: o.id }, data: { totalUzs: 1_150_100 } })
    return o
  }
  it('linked customer -> received with item count, total, pay on delivery and an Open order web_app button', async () => {
    await mkAccount()
    const o = await placed('en')
    const f = fakeFetch()
    expect(await notifyOrderPlaced(o.number, { fetchImpl: f.impl, siteUrl: 'https://shop.test' })).toBe('sent')
    const text = f.calls[0].body.text
    expect(text).toContain('#1001')
    expect(text).toContain('3 items')
    expect(text).toContain('1,150,100 UZS')
    expect(text).toContain('on delivery')
    expect(f.calls[0].body.reply_markup!.inline_keyboard[0][0]).toEqual({
      text: 'View order',
      web_app: { url: 'https://shop.test/tg?next=%2Fen%2Faccount%2Forders%2F1001' },
    })
  })
  it('uz and ru copy', async () => {
    await mkAccount()
    const f = fakeFetch()
    await notifyOrderPlaced((await placed('uz')).number, { fetchImpl: f.impl, siteUrl: '' })
    await notifyOrderPlaced((await placed('ru')).number, { fetchImpl: f.impl, siteUrl: '' })
    expect(f.calls[0].body.text).toMatch(/qabul qilindi/)
    expect(f.calls[1].body.text).toMatch(/принят/)
  })
  it('skipped for guests, notifications off and unknown orders', async () => {
    const f = fakeFetch()
    const o = await placed()
    expect(await notifyOrderPlaced(o.number, { fetchImpl: f.impl })).toBe('skipped')
    await mkAccount({ notify: false })
    expect(await notifyOrderPlaced(o.number, { fetchImpl: f.impl })).toBe('skipped')
    expect(await notifyOrderPlaced(999999, { fetchImpl: f.impl })).toBe('skipped')
    expect(f.calls).toHaveLength(0)
  })
  it('Telegram down -> failed, never throws', async () => {
    await mkAccount()
    const o = await placed()
    expect(await notifyOrderPlaced(o.number, { fetchImpl: fakeFetch({ fail: 'throw' }).impl })).toBe('failed')
  })
})
