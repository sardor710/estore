import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prisma } from '@/lib/db'
import { updateSettings } from '@/lib/settings'
import type { Staff } from '@/lib/admin/session'
import {
  broadcastAudience,
  broadcastMessage,
  cleanMessage,
  deliverBroadcast,
  listAccountMessages,
  listBroadcasts,
  listClientMessages,
  markMessagesRead,
  sendCustomerMessage,
  unreadMessageCount,
} from '@/lib/customer-messages'
import { deleteAccount } from '@/lib/account/profile'
import { saveMessageMedia } from '@/lib/uploads'

const TMP = mkdtempSync(join(tmpdir(), 'estore-msg-media-'))
process.env.UPLOADS_DIR = TMP
afterAll(() => rmSync(TMP, { recursive: true, force: true }))

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8])
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 1, 2, 3, 4])
async function stored(bytes: Uint8Array<ArrayBuffer>, name: string) {
  const r = await saveMessageMedia(new File([bytes], name))
  if (!r.ok) throw new Error(r.error)
  return r
}

const staff: Staff = { id: 0, email: 'owner@shop.uz', name: 'Owner', role: 'ADMIN' }
const NOW = new Date('2026-11-18T10:00:00Z')

type Call = { method: string; body: Record<string, any> }
function fakeTelegram(failChats: string[] = []) {
  const calls: Call[] = []
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const method = String(url).split('/').pop()!
    let body: Record<string, any> = {}
    if (init?.body instanceof FormData) for (const [k, v] of init.body.entries()) body[k] = typeof v === 'string' ? v : { file: (v as File).name, size: (v as File).size }
    else if (init?.body) body = JSON.parse(String(init.body))
    calls.push({ method, body })
    if (failChats.includes(String(body.chat_id))) return Response.json({ ok: false, description: 'Forbidden: bot was blocked by the user' }, { status: 403 })
    const result =
      method === 'sendPhoto' ? { message_id: 1, photo: [{ file_id: 'small' }, { file_id: 'PHOTO_ID' }] } : method === 'sendVideo' ? { message_id: 1, video: { file_id: 'VIDEO_ID' } } : { message_id: 1 }
    return Response.json({ ok: true, result })
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

describe('cleanMessage', () => {
  it('trims, rejects empty and too long text', () => {
    expect(cleanMessage({ text: '  hi \r\n there ' })).toEqual({ ok: true, value: { text: 'hi \n there', mediaUrl: null, mediaKind: null } })
    expect(cleanMessage({ text: '   ' }).ok).toBe(false)
    expect(cleanMessage({ text: 42 }).ok).toBe(false)
    expect(cleanMessage({ text: 'x'.repeat(2001) }).ok).toBe(false)
    expect(cleanMessage({ text: 'x'.repeat(2000) }).ok).toBe(true)
  })
  it('media alone is fine; with media the caption is limited to 1024; foreign URLs are refused', () => {
    const url = '/uploads/2026/11/' + 'a'.repeat(32) + '.mp4'
    expect(cleanMessage({ mediaUrl: url })).toEqual({ ok: true, value: { text: '', mediaUrl: url, mediaKind: 'video' } })
    expect(cleanMessage({ mediaUrl: url, text: 'x'.repeat(1025) }).ok).toBe(false)
    expect(cleanMessage({ mediaUrl: url, text: 'x'.repeat(1024) }).ok).toBe(true)
    expect(cleanMessage({ mediaUrl: 'https://evil.example/x.jpg' }).ok).toBe(false)
    expect(cleanMessage({ mediaUrl: '/uploads/2026/11/../../.env' }).ok).toBe(false)
  })
})

describe('sendCustomerMessage', () => {
  it('stores the message and sends exactly the text (no header, no buttons), logs activity', async () => {
    const c = await customer({ locale: 'ru' })
    const tg = fakeTelegram()
    const r = await sendCustomerMessage(c.id, { text: 'Ваш заказ готов' }, staff, { fetchImpl: tg.fetchImpl })
    expect(r).toMatchObject({ ok: true, telegram: 'sent' })
    const sent = tg.calls.find((x) => x.method === 'sendMessage')!
    expect(sent.body.chat_id).toBe(c.telegramChatId)
    expect(sent.body.text).toBe('Ваш заказ готов')
    expect(sent.body.parse_mode).toBeUndefined()
    expect(sent.body.reply_markup).toBeUndefined()
    const [m] = await listClientMessages(c.id)
    expect(m).toMatchObject({ text: 'Ваш заказ готов', telegram: 'sent', createdBy: 'owner@shop.uz', readAt: null })
    expect(await prisma.activityLog.count({ where: { entity: 'message' } })).toBe(1)
  })

  it('is sent to Telegram even with order notifications off (a direct message from staff)', async () => {
    const c = await customer({ notify: false })
    const tg = fakeTelegram()
    expect(await sendCustomerMessage(c.id, { text: 'Hi' }, staff, { fetchImpl: tg.fetchImpl })).toMatchObject({ ok: true, telegram: 'sent' })
  })

  it('Telegram failure -> stored with telegram=failed', async () => {
    const c = await customer()
    const tg = fakeTelegram([c.telegramChatId!])
    expect(await sendCustomerMessage(c.id, { text: 'Hi' }, staff, { fetchImpl: tg.fetchImpl })).toMatchObject({ ok: true, telegram: 'failed' })
    expect((await listClientMessages(c.id))[0].telegram).toBe('failed')
  })

  it('refuses clients without an account, unknown clients and empty text; nothing stored or sent', async () => {
    const noAcc = await customer({ account: false })
    const tg = fakeTelegram()
    expect((await sendCustomerMessage(noAcc.id, { text: 'Hi' }, staff, { fetchImpl: tg.fetchImpl })).ok).toBe(false)
    expect((await sendCustomerMessage(999999, { text: 'Hi' }, staff, { fetchImpl: tg.fetchImpl })).ok).toBe(false)
    const c = await customer()
    expect((await sendCustomerMessage(c.id, { text: '  ' }, staff, { fetchImpl: tg.fetchImpl })).ok).toBe(false)
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
    const r = await broadcastMessage({ text: 'Sale this weekend!' }, staff, { fetchImpl: tg.fetchImpl, delayMs: 0 })
    expect(r).toMatchObject({ ok: true, recipients: 4 })
    if (!r.ok) return
    await deliverBroadcast(r.id, { fetchImpl: tg.fetchImpl, delayMs: 0 }) // idempotent: only pending rows

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
    expect((await broadcastMessage({ text: 'Hi' }, staff, { delayMs: 0 })).ok).toBe(false)
    expect(await prisma.messageBroadcast.count()).toBe(0)
  })
})

describe('account side', () => {
  it('lists own messages newest first, counts unread, marks read', async () => {
    const c = await customer()
    const other = await customer()
    const tg = fakeTelegram()
    await sendCustomerMessage(c.id, { text: 'first' }, staff, { fetchImpl: tg.fetchImpl })
    await sendCustomerMessage(c.id, { text: 'second' }, staff, { fetchImpl: tg.fetchImpl })
    await sendCustomerMessage(other.id, { text: 'not yours' }, staff, { fetchImpl: tg.fetchImpl })
    expect((await listAccountMessages(c.id)).map((m) => m.text)).toEqual(['second', 'first'])
    expect(await unreadMessageCount(c.id)).toBe(2)
    await markMessagesRead(c.id)
    expect(await unreadMessageCount(c.id)).toBe(0)
    expect(await unreadMessageCount(other.id)).toBe(1)
  })

  it('deleting the account removes its messages', async () => {
    const c = await customer()
    await sendCustomerMessage(c.id, { text: 'hello' }, staff, { fetchImpl: fakeTelegram().fetchImpl })
    expect(await deleteAccount(c.id)).toBe(true)
    expect(await prisma.customerMessage.count()).toBe(0)
  })
})

describe('media posts', () => {
  it('photo + caption -> sendPhoto with the file uploaded and the caption as written; stored with the media', async () => {
    const c = await customer()
    const m = await stored(PNG, 'a.png')
    const tg = fakeTelegram()
    expect(await sendCustomerMessage(c.id, { text: 'New arrivals', mediaUrl: m.url }, staff, { fetchImpl: tg.fetchImpl })).toMatchObject({ ok: true, telegram: 'sent' })
    const call = tg.calls[0]
    expect(call.method).toBe('sendPhoto')
    expect(call.body).toMatchObject({ chat_id: c.telegramChatId, caption: 'New arrivals', photo: { size: PNG.length } })
    expect((await listAccountMessages(c.id))[0]).toMatchObject({ text: 'New arrivals', mediaUrl: m.url, mediaKind: 'photo' })
  })

  it('video without text -> sendVideo, no caption, streaming on', async () => {
    const c = await customer()
    const m = await stored(MP4, 'v.mp4')
    expect(m.kind).toBe('video')
    const tg = fakeTelegram()
    await sendCustomerMessage(c.id, { mediaUrl: m.url }, staff, { fetchImpl: tg.fetchImpl })
    expect(tg.calls[0].method).toBe('sendVideo')
    expect(tg.calls[0].body.caption).toBeUndefined()
    expect(tg.calls[0].body.supports_streaming).toBe('true')
  })

  it('broadcast uploads the file once, then reuses the file_id for everyone else', async () => {
    const a = await customer()
    const b = await customer()
    const c = await customer()
    const m = await stored(MP4, 'v.mp4')
    const tg = fakeTelegram()
    const r = await broadcastMessage({ text: 'Promo', mediaUrl: m.url }, staff, { fetchImpl: tg.fetchImpl, delayMs: 0 })
    if (!r.ok) throw new Error(r.error)
    // the background delivery (runAfterResponse) is the only run: wait for it to finish
    await vi.waitFor(async () => expect(await prisma.customerMessage.count({ where: { broadcastId: r.id, telegram: { in: ['pending', 'sending'] } } })).toBe(0))
    const sends = tg.calls.filter((x) => x.method === 'sendVideo')
    expect(sends.map((x) => x.body.chat_id).sort()).toEqual([a.telegramChatId, b.telegramChatId, c.telegramChatId].sort())
    expect(sends.filter((x) => typeof x.body.video === 'object')).toHaveLength(1)
    expect(sends.filter((x) => x.body.video === 'VIDEO_ID')).toHaveLength(2)
    expect(sends.every((x) => x.body.caption === 'Promo')).toBe(true)
    const [row] = await listBroadcasts()
    expect(row).toMatchObject({ mediaUrl: m.url, mediaKind: 'video', sent: 3 })
  })

  it('a missing media file -> stored, Telegram failed', async () => {
    const c = await customer()
    const tg = fakeTelegram()
    const url = '/uploads/2026/11/' + 'b'.repeat(32) + '.png'
    expect(await sendCustomerMessage(c.id, { mediaUrl: url }, staff, { fetchImpl: tg.fetchImpl })).toMatchObject({ ok: true, telegram: 'failed' })
    expect(tg.calls).toHaveLength(0)
  })
})

describe('saveMessageMedia', () => {
  it('accepts images and MP4, refuses QuickTime and other files', async () => {
    expect((await stored(PNG, 'x.png')).kind).toBe('photo')
    const mov = MP4.slice()
    mov.set([0x71, 0x74, 0x20, 0x20], 8)
    expect((await saveMessageMedia(new File([mov], 'x.mov'))).ok).toBe(false)
    expect((await saveMessageMedia(new File(['<svg/>'], 'x.svg'))).ok).toBe(false)
  })
})
