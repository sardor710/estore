import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/lib/db'
import { updateSettings } from '@/lib/settings'
import type { Staff } from '@/lib/admin/session'
import {
  broadcastAudience,
  broadcastMessage,
  cleanMessageText,
  deliverBroadcast,
  listAccountMessages,
  listBroadcasts,
  listClientMessages,
  markMessagesRead,
  sendCustomerMessage,
  unreadMessageCount,
} from '@/lib/customer-messages'
import { deleteAccount } from '@/lib/account/profile'

const staff: Staff = { id: 0, email: 'owner@shop.uz', name: 'Owner', role: 'ADMIN' }
const NOW = new Date('2026-11-18T10:00:00Z')

type Call = { method: string; body: Record<string, any> }
function fakeTelegram(failChats: string[] = []) {
  const calls: Call[] = []
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const method = String(url).split('/').pop()!
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    calls.push({ method, body })
    if (failChats.includes(String(body.chat_id))) return Response.json({ ok: false, description: 'Forbidden: bot was blocked by the user' }, { status: 403 })
    return Response.json({ ok: true, result: { message_id: 1 } })
  })
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch }
}

let n = 0
async function customer(o: { account?: boolean; chat?: string | null; locale?: string | null; notify?: boolean; blocked?: boolean } = {}) {
  n++
  const account = o.account ?? true
  return prisma.customer.create({
    data: {
      phone: `+99890${String(1000000 + n).slice(-7)}`,
      name: `C${n}`,
      region: '',
      tags: [],
      blocked: o.blocked ?? false,
      notifyTelegram: o.notify ?? true,
      accountLocale: o.locale ?? null,
      ...(account ? { accountCreatedAt: NOW, telegramUserId: `u${n}`, telegramChatId: o.chat === undefined ? `${7000 + n}` : o.chat } : {}),
    },
  })
}

beforeEach(async () => {
  await updateSettings({ telegramBotToken: '111:TEST' })
  process.env.SITE_URL = 'https://shop.example.uz'
})

describe('cleanMessageText', () => {
  it('trims, rejects empty and too long text', () => {
    expect(cleanMessageText('  hi \r\n there ')).toEqual({ ok: true, text: 'hi \n there' })
    expect(cleanMessageText('   ').ok).toBe(false)
    expect(cleanMessageText(42).ok).toBe(false)
    expect(cleanMessageText('x'.repeat(2001)).ok).toBe(false)
    expect(cleanMessageText('x'.repeat(2000)).ok).toBe(true)
  })
})

describe('sendCustomerMessage', () => {
  it('stores the message, sends it in the account language with an Open messages button, logs activity', async () => {
    const c = await customer({ locale: 'ru' })
    const tg = fakeTelegram()
    const r = await sendCustomerMessage(c.id, 'Ваш заказ готов', staff, { fetchImpl: tg.fetchImpl })
    expect(r).toMatchObject({ ok: true, telegram: 'sent' })
    const sent = tg.calls.find((x) => x.method === 'sendMessage')!
    expect(sent.body.chat_id).toBe(c.telegramChatId)
    expect(sent.body.text).toContain('Сообщение от')
    expect(sent.body.text).toContain('Ваш заказ готов')
    expect(sent.body.parse_mode).toBeUndefined()
    expect(sent.body.reply_markup.inline_keyboard[0][0]).toEqual({
      text: 'Открыть сообщения',
      web_app: { url: 'https://shop.example.uz/tg?next=%2Fru%2Faccount%2Fmessages' },
    })
    const [m] = await listClientMessages(c.id)
    expect(m).toMatchObject({ text: 'Ваш заказ готов', telegram: 'sent', createdBy: 'owner@shop.uz', readAt: null })
    expect(await prisma.activityLog.count({ where: { entity: 'message' } })).toBe(1)
  })

  it('is sent to Telegram even with order notifications off (a direct message from staff)', async () => {
    const c = await customer({ notify: false })
    const tg = fakeTelegram()
    expect(await sendCustomerMessage(c.id, 'Hi', staff, { fetchImpl: tg.fetchImpl })).toMatchObject({ ok: true, telegram: 'sent' })
  })

  it('Telegram failure -> stored with telegram=failed', async () => {
    const c = await customer()
    const tg = fakeTelegram([c.telegramChatId!])
    expect(await sendCustomerMessage(c.id, 'Hi', staff, { fetchImpl: tg.fetchImpl })).toMatchObject({ ok: true, telegram: 'failed' })
    expect((await listClientMessages(c.id))[0].telegram).toBe('failed')
  })

  it('refuses clients without an account, unknown clients and empty text; nothing stored or sent', async () => {
    const noAcc = await customer({ account: false })
    const tg = fakeTelegram()
    expect((await sendCustomerMessage(noAcc.id, 'Hi', staff, { fetchImpl: tg.fetchImpl })).ok).toBe(false)
    expect((await sendCustomerMessage(999999, 'Hi', staff, { fetchImpl: tg.fetchImpl })).ok).toBe(false)
    const c = await customer()
    expect((await sendCustomerMessage(c.id, '  ', staff, { fetchImpl: tg.fetchImpl })).ok).toBe(false)
    expect(await prisma.customerMessage.count()).toBe(0)
    expect(tg.calls).toHaveLength(0)
  })
})

describe('broadcastMessage', () => {
  it('stores a copy for every non-blocked account; Telegram only to those with notifications on and a chat', async () => {
    const on = await customer({ locale: 'en' })
    const off = await customer({ notify: false })
    const noChat = await customer({ chat: null })
    const failing = await customer()
    const blocked = await customer({ blocked: true })
    await customer({ account: false })
    expect(await broadcastAudience()).toEqual({ accounts: 4, telegram: 2 })

    const tg = fakeTelegram([failing.telegramChatId!])
    const r = await broadcastMessage('Sale this weekend!', staff, { fetchImpl: tg.fetchImpl, delayMs: 0 })
    expect(r).toMatchObject({ ok: true, recipients: 4 })
    if (!r.ok) return
    await deliverBroadcast(r.id, 'Sale this weekend!', { fetchImpl: tg.fetchImpl, delayMs: 0 }) // idempotent: only pending rows

    const status = async (id: number) => (await listClientMessages(id))[0]?.telegram
    expect(await status(on.id)).toBe('sent')
    expect(await status(off.id)).toBe('skipped')
    expect(await status(noChat.id)).toBe('skipped')
    expect(await status(failing.id)).toBe('failed')
    expect(await listClientMessages(blocked.id)).toHaveLength(0)
    expect(tg.calls.filter((c) => c.method === 'sendMessage').map((c) => c.body.chat_id).sort()).toEqual(
      [on.telegramChatId, failing.telegramChatId].sort(),
    )

    await markMessagesRead(on.id)
    const [b] = await listBroadcasts()
    expect(b).toMatchObject({ recipients: 4, sent: 1, failed: 1, skipped: 2, pending: 0, read: 1 })
  })

  it('no accounts -> error, nothing stored', async () => {
    await customer({ account: false })
    expect((await broadcastMessage('Hi', staff, { delayMs: 0 })).ok).toBe(false)
    expect(await prisma.messageBroadcast.count()).toBe(0)
  })
})

describe('account side', () => {
  it('lists own messages newest first, counts unread, marks read', async () => {
    const c = await customer()
    const other = await customer()
    const tg = fakeTelegram()
    await sendCustomerMessage(c.id, 'first', staff, { fetchImpl: tg.fetchImpl })
    await sendCustomerMessage(c.id, 'second', staff, { fetchImpl: tg.fetchImpl })
    await sendCustomerMessage(other.id, 'not yours', staff, { fetchImpl: tg.fetchImpl })
    expect((await listAccountMessages(c.id)).map((m) => m.text)).toEqual(['second', 'first'])
    expect(await unreadMessageCount(c.id)).toBe(2)
    await markMessagesRead(c.id)
    expect(await unreadMessageCount(c.id)).toBe(0)
    expect(await unreadMessageCount(other.id)).toBe(1)
  })

  it('deleting the account removes its messages', async () => {
    const c = await customer()
    await sendCustomerMessage(c.id, 'hello', staff, { fetchImpl: fakeTelegram().fetchImpl })
    expect(await deleteAccount(c.id)).toBe(true)
    expect(await prisma.customerMessage.count()).toBe(0)
  })
})
