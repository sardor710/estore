// Shop -> customer messages (one-way posts). Each message is stored for the customer's website account (Messages
// page) and delivered by the shop's Telegram bot exactly as written: the text, optionally with one photo, GIF or MP4
// video (sent as the media caption). Admin side: one customer (client page) or a broadcast to every customer with an
// account. Plain text only: the bot sends no parse_mode and the website renders it as text.

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { prisma } from '@/lib/db'
import { logActivity } from '@/lib/admin/activity'
import type { Staff } from '@/lib/admin/session'
import { sendBotMedia, sendBotMessage, type BotMediaSource } from '@/lib/telegram-bot/api'
import { CONTENT_TYPES, mediaFile, mediaKindOf, type MediaExt, type MediaKind } from '@/lib/uploads'
import { runAfterResponse } from '@/lib/after-response'

/** Text-only message limit (Telegram allows 4096). */
export const MESSAGE_MAX = 2000
/** With an attachment the text is the media caption: Telegram allows 1024 characters. */
export const CAPTION_MAX = 1024
/** Telegram allows ~30 messages/s per bot; stay well below it for broadcasts. */
const BROADCAST_DELAY_MS = 60

export type TelegramStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped'
export type MessageInput = { text?: unknown; mediaUrl?: unknown }
export type SendResult = { ok: true; id: number; telegram: TelegramStatus } | { ok: false; error: string }
export type BroadcastResult = { ok: true; id: number; recipients: number } | { ok: false; error: string }
type Deps = { fetchImpl?: typeof fetch; delayMs?: number }
type Clean = { text: string; mediaUrl: string | null; mediaKind: MediaKind | null }

/** Validated message: trimmed text and an optional attachment previously stored by saveMessageMedia. */
export function cleanMessage(input: MessageInput): { ok: true; value: Clean } | { ok: false; error: string } {
  const text = typeof input.text === 'string' ? input.text.replace(/\r\n/g, '\n').trim() : ''
  const rawUrl = typeof input.mediaUrl === 'string' && input.mediaUrl ? input.mediaUrl : null
  const mediaKind = rawUrl ? mediaKindOf(rawUrl) : null
  if (rawUrl && !mediaKind) return { ok: false, error: 'The attachment is not valid. Upload it again.' }
  if (!text && !rawUrl) return { ok: false, error: 'Write a message or attach a photo or video.' }
  const max = rawUrl ? CAPTION_MAX : MESSAGE_MAX
  if (text.length > max) {
    return { ok: false, error: rawUrl ? `With a photo or video the text can be at most ${CAPTION_MAX} characters.` : `The message is too long (max ${MESSAGE_MAX} characters).` }
  }
  return { ok: true, value: { text, mediaUrl: rawUrl, mediaKind } }
}

/** The attachment as a fresh upload (first recipient) or Telegram's file_id (every later one). */
async function mediaSource(url: string, fileId: string | null): Promise<BotMediaSource | null> {
  if (fileId) return { fileId }
  const file = mediaFile(url)
  if (!file) return null
  const data = new Uint8Array(await readFile(file))
  return { data, filename: basename(file), contentType: CONTENT_TYPES[basename(file).split('.').pop() as MediaExt] }
}

/** Per-send state: the attachment's file_id once Telegram has it (broadcasts upload the file only once). */
type Media = { url: string; kind: MediaKind; fileId: string | null } | null

/** Sends one stored message through the bot and records the outcome on the row. */
async function deliver(messageId: number, chatId: string | null, text: string, media: Media, deps: Deps): Promise<TelegramStatus> {
  let status: TelegramStatus = 'skipped'
  if (chatId) {
    if (media) {
      const source = await mediaSource(media.url, media.fileId).catch(() => null)
      const r = source ? await sendBotMedia(chatId, media.kind, source, text, deps.fetchImpl) : null
      if (r?.fileId) media.fileId = r.fileId
      status = r ? 'sent' : 'failed'
    } else {
      status = (await sendBotMessage(chatId, text, undefined, deps.fetchImpl)) ? 'sent' : 'failed'
    }
  }
  await prisma.customerMessage.update({ where: { id: messageId }, data: { telegram: status } })
  return status
}

const mediaOf = (v: Clean): Media => (v.mediaUrl && v.mediaKind ? { url: v.mediaUrl, kind: v.mediaKind, fileId: null } : null)

/** Admin -> one customer. Needs a website account (that is where the message lives); always sent to Telegram. */
export async function sendCustomerMessage(customerId: number, input: MessageInput, staff: Staff, deps: Deps = {}): Promise<SendResult> {
  const c0 = cleanMessage(input)
  if (!c0.ok) return c0
  const v = c0.value
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, accountCreatedAt: true, telegramChatId: true },
  })
  if (!c) return { ok: false, error: 'Client not found.' }
  if (!c.accountCreatedAt) return { ok: false, error: 'This client has no account yet (they have not signed in with Telegram).' }
  const m = await prisma.customerMessage.create({
    data: { customerId: c.id, text: v.text, mediaUrl: v.mediaUrl, mediaKind: v.mediaKind, createdBy: staff.email },
  })
  const telegram = await deliver(m.id, c.telegramChatId, v.text, mediaOf(v), deps)
  await logActivity(staff, 'create', 'message', m.id, `Sent a message${v.mediaKind ? ` (${v.mediaKind})` : ''} to client #${c.id} ${c.name} (Telegram: ${telegram})`)
  return { ok: true, id: m.id, telegram }
}

/** Customers a broadcast goes to: every account that is not blocked. */
const broadcastWhere = { accountCreatedAt: { not: null }, blocked: false } as const

/** For the admin form: how many accounts get it, and how many of them also in Telegram (notifications on). */
export async function broadcastAudience(): Promise<{ accounts: number; telegram: number }> {
  const [accounts, telegram] = await Promise.all([
    prisma.customer.count({ where: broadcastWhere }),
    prisma.customer.count({ where: { ...broadcastWhere, notifyTelegram: true, telegramChatId: { not: null } } }),
  ])
  return { accounts, telegram }
}

/**
 * Admin -> every customer with an account. Stored for all of them right away; Telegram copies go out in the
 * background (throttled) and only to customers with notifications on.
 */
export async function broadcastMessage(input: MessageInput, staff: Staff, deps: Deps = {}): Promise<BroadcastResult> {
  const c0 = cleanMessage(input)
  if (!c0.ok) return c0
  const v = c0.value
  const customers = await prisma.customer.findMany({ where: broadcastWhere, select: { id: true }, orderBy: { id: 'asc' } })
  if (!customers.length) return { ok: false, error: 'No customers with an account yet.' }
  const b = await prisma.$transaction(async (tx) => {
    const b = await tx.messageBroadcast.create({
      data: { text: v.text, mediaUrl: v.mediaUrl, mediaKind: v.mediaKind, recipients: customers.length, createdBy: staff.email },
    })
    await tx.customerMessage.createMany({
      data: customers.map((c) => ({
        customerId: c.id,
        text: v.text,
        mediaUrl: v.mediaUrl,
        mediaKind: v.mediaKind,
        broadcastId: b.id,
        createdBy: staff.email,
      })),
    })
    return b
  })
  await logActivity(staff, 'create', 'message', `broadcast-${b.id}`, `Broadcast a message${v.mediaKind ? ` (${v.mediaKind})` : ''} to ${customers.length} customers`)
  runAfterResponse(() => deliverBroadcast(b.id, deps))
  return { ok: true, id: b.id, recipients: customers.length }
}

/** Sends the pending copies of a broadcast one by one (the attachment is uploaded once). Exported for tests. */
export async function deliverBroadcast(broadcastId: number, deps: Deps = {}): Promise<void> {
  const b = await prisma.messageBroadcast.findUnique({ where: { id: broadcastId } })
  if (!b) return
  const kind = b.mediaUrl ? mediaKindOf(b.mediaUrl) : null
  const media: Media = b.mediaUrl && kind ? { url: b.mediaUrl, kind, fileId: null } : null
  const rows = await prisma.customerMessage.findMany({
    where: { broadcastId, telegram: 'pending' },
    select: { id: true, customer: { select: { telegramChatId: true, notifyTelegram: true } } },
    orderBy: { id: 'asc' },
  })
  const delay = deps.delayMs ?? BROADCAST_DELAY_MS
  for (const r of rows) {
    // Claim the row first, so two runs over the same broadcast never send a copy twice.
    const claimed = await prisma.customerMessage.updateMany({ where: { id: r.id, telegram: 'pending' }, data: { telegram: 'sending' } })
    if (claimed.count !== 1) continue
    const chatId = r.customer.notifyTelegram ? r.customer.telegramChatId : null
    try {
      await deliver(r.id, chatId, b.text, media, deps)
    } catch {
      await prisma.customerMessage.updateMany({ where: { id: r.id }, data: { telegram: 'failed' } }).catch(() => {})
    }
    if (chatId && delay > 0) await new Promise((res) => setTimeout(res, delay))
  }
}

/** Admin: one client's messages, newest first. */
export function listClientMessages(customerId: number, take = 50) {
  return prisma.customerMessage.findMany({
    where: { customerId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    select: { id: true, text: true, mediaUrl: true, mediaKind: true, telegram: true, readAt: true, createdAt: true, createdBy: true, broadcastId: true },
  })
}

/** Admin: broadcast history with delivery counts. */
export async function listBroadcasts(take = 30) {
  const list = await prisma.messageBroadcast.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take })
  if (!list.length) return []
  const ids = list.map((b) => b.id)
  const [byStatus, read] = await Promise.all([
    prisma.customerMessage.groupBy({ by: ['broadcastId', 'telegram'], where: { broadcastId: { in: ids } }, _count: { _all: true } }),
    prisma.customerMessage.groupBy({ by: ['broadcastId'], where: { broadcastId: { in: ids }, readAt: { not: null } }, _count: { _all: true } }),
  ])
  return list.map((b) => {
    const counts: Record<TelegramStatus, number> = { pending: 0, sending: 0, sent: 0, failed: 0, skipped: 0 }
    for (const s of byStatus) if (s.broadcastId === b.id && s.telegram in counts) counts[s.telegram as TelegramStatus] = s._count._all
    return { ...b, ...counts, pending: counts.pending + counts.sending, read: read.find((r) => r.broadcastId === b.id)?._count._all ?? 0 }
  })
}

/** Customer: own messages, newest first. */
export function listAccountMessages(customerId: number, take = 100) {
  return prisma.customerMessage.findMany({
    where: { customerId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    select: { id: true, text: true, mediaUrl: true, mediaKind: true, readAt: true, createdAt: true },
  })
}

export function unreadMessageCount(customerId: number): Promise<number> {
  return prisma.customerMessage.count({ where: { customerId, readAt: null } })
}

export async function markMessagesRead(customerId: number, now = new Date()): Promise<void> {
  await prisma.customerMessage.updateMany({ where: { customerId, readAt: null }, data: { readAt: now } })
}
