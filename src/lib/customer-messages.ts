// Shop -> customer messages (one-way). Each message is stored for the customer's website account (Messages page)
// and delivered by the shop's Telegram bot. Admin side: one customer (client page) or a broadcast to every
// customer with an account. Plain text only: the bot sends no parse_mode and the website renders it as text.

import { prisma } from '@/lib/db'
import { logActivity } from '@/lib/admin/activity'
import type { Staff } from '@/lib/admin/session'
import { inlineKeyboard, sendBotMessage } from '@/lib/telegram-bot/api'
import { botCopy, type BotLocale } from '@/lib/telegram-bot/messages'
import { shopButton } from '@/lib/telegram-bot/handler'
import { runAfterResponse } from '@/lib/after-response'

export const MESSAGE_MAX = 2000
/** Telegram allows ~30 messages/s per bot; stay well below it for broadcasts. */
const BROADCAST_DELAY_MS = 60

export type TelegramStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped'
export type SendResult = { ok: true; id: number; telegram: TelegramStatus } | { ok: false; error: string }
export type BroadcastResult = { ok: true; id: number; recipients: number } | { ok: false; error: string }
type Deps = { fetchImpl?: typeof fetch; delayMs?: number }

/** Trimmed text, or an error message for the admin. */
export function cleanMessageText(raw: unknown): { ok: true; text: string } | { ok: false; error: string } {
  const text = typeof raw === 'string' ? raw.replace(/\r\n/g, '\n').trim() : ''
  if (!text) return { ok: false, error: 'Write a message first.' }
  if (text.length > MESSAGE_MAX) return { ok: false, error: `The message is too long (max ${MESSAGE_MAX} characters).` }
  return { ok: true, text }
}

const toLocale = (v: string | null | undefined): BotLocale => (v === 'ru' || v === 'en' ? v : 'uz')

/** Sends one stored message through the bot and records the outcome on the row. */
async function deliver(
  messageId: number,
  to: { chatId: string | null; locale: string | null },
  text: string,
  deps: Deps,
): Promise<TelegramStatus> {
  let status: TelegramStatus = 'skipped'
  if (to.chatId) {
    const locale = toLocale(to.locale)
    const copy = botCopy(locale)
    const button = shopButton(copy.messagesButton, `/${locale}/account/messages`)
    const ok = await sendBotMessage(to.chatId, copy.shopMessage(text), button ? inlineKeyboard([[button]]) : undefined, deps.fetchImpl)
    status = ok ? 'sent' : 'failed'
  }
  await prisma.customerMessage.update({ where: { id: messageId }, data: { telegram: status } })
  return status
}

/** Admin -> one customer. Needs a website account (that is where the message lives); always sent to Telegram. */
export async function sendCustomerMessage(customerId: number, rawText: unknown, staff: Staff, deps: Deps = {}): Promise<SendResult> {
  const t = cleanMessageText(rawText)
  if (!t.ok) return t
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, accountCreatedAt: true, telegramChatId: true, accountLocale: true },
  })
  if (!c) return { ok: false, error: 'Client not found.' }
  if (!c.accountCreatedAt) return { ok: false, error: 'This client has no account yet (they have not signed in with Telegram).' }
  const m = await prisma.customerMessage.create({ data: { customerId: c.id, text: t.text, createdBy: staff.email } })
  const telegram = await deliver(m.id, { chatId: c.telegramChatId, locale: c.accountLocale }, t.text, deps)
  await logActivity(staff, 'create', 'message', m.id, `Sent a message to client #${c.id} ${c.name} (Telegram: ${telegram})`)
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
export async function broadcastMessage(rawText: unknown, staff: Staff, deps: Deps = {}): Promise<BroadcastResult> {
  const t = cleanMessageText(rawText)
  if (!t.ok) return t
  const customers = await prisma.customer.findMany({
    where: broadcastWhere,
    select: { id: true, telegramChatId: true, accountLocale: true, notifyTelegram: true },
    orderBy: { id: 'asc' },
  })
  if (!customers.length) return { ok: false, error: 'No customers with an account yet.' }
  const b = await prisma.$transaction(async (tx) => {
    const b = await tx.messageBroadcast.create({ data: { text: t.text, recipients: customers.length, createdBy: staff.email } })
    await tx.customerMessage.createMany({
      data: customers.map((c) => ({ customerId: c.id, text: t.text, broadcastId: b.id, createdBy: staff.email })),
    })
    return b
  })
  await logActivity(staff, 'create', 'message', `broadcast-${b.id}`, `Broadcast a message to ${customers.length} customers`)
  runAfterResponse(() => deliverBroadcast(b.id, t.text, deps))
  return { ok: true, id: b.id, recipients: customers.length }
}

/** Sends the pending copies of a broadcast one by one. Exported for tests. */
export async function deliverBroadcast(broadcastId: number, text: string, deps: Deps = {}): Promise<void> {
  const rows = await prisma.customerMessage.findMany({
    where: { broadcastId, telegram: 'pending' },
    select: { id: true, customer: { select: { telegramChatId: true, accountLocale: true, notifyTelegram: true } } },
    orderBy: { id: 'asc' },
  })
  const delay = deps.delayMs ?? BROADCAST_DELAY_MS
  for (const r of rows) {
    // Claim the row first, so two runs over the same broadcast never send a copy twice.
    const claimed = await prisma.customerMessage.updateMany({ where: { id: r.id, telegram: 'pending' }, data: { telegram: 'sending' } })
    if (claimed.count !== 1) continue
    const chatId = r.customer.notifyTelegram ? r.customer.telegramChatId : null
    try {
      await deliver(r.id, { chatId, locale: r.customer.accountLocale }, text, deps)
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
    select: { id: true, text: true, telegram: true, readAt: true, createdAt: true, createdBy: true, broadcastId: true },
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
    select: { id: true, text: true, readAt: true, createdAt: true },
  })
}

export function unreadMessageCount(customerId: number): Promise<number> {
  return prisma.customerMessage.count({ where: { customerId, readAt: null } })
}

export async function markMessagesRead(customerId: number, now = new Date()): Promise<void> {
  await prisma.customerMessage.updateMany({ where: { customerId, readAt: null }, data: { readAt: now } })
}
