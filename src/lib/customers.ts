import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { getSettings } from '@/lib/settings'
import { tashkentDay } from '@/lib/analytics/visitor'
import { logActivity } from '@/lib/admin/activity'
import type { Staff } from '@/lib/admin/session'

type Db = Prisma.TransactionClient

export const CUSTOMERS_PAGE_SIZE = 50
export const INACTIVE_AFTER_DAYS = 180
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_NOTES = 2000
const MAX_TAGS = 20
const MAX_TAG_LEN = 30
/** Orders that count towards a client's `orders` / `spentUzs` (revenue statuses). */
const REVENUE = ['CONFIRMED', 'DELIVERED']

// ---------- segments ----------

export type Segment = 'NEW' | 'RETURNING' | 'VIP' | 'INACTIVE'
export const SEGMENTS: Segment[] = ['NEW', 'RETURNING', 'VIP', 'INACTIVE']
export const isSegment = (v: unknown): v is Segment => typeof v === 'string' && (SEGMENTS as string[]).includes(v)

/** Precedence: INACTIVE (last order > 180 days ago) > VIP (spent >= threshold) > RETURNING (>= 2 orders) > NEW. */
export function segmentOf(s: { orders: number; spentUzs: number; lastOrderAt: Date | null }, vipThresholdUzs: number, now: Date): Segment {
  if (s.lastOrderAt && now.getTime() - s.lastOrderAt.getTime() > INACTIVE_AFTER_DAYS * DAY_MS) return 'INACTIVE'
  if (s.spentUzs >= vipThresholdUzs) return 'VIP'
  if (s.orders >= 2) return 'RETURNING'
  return 'NEW'
}

// ---------- order-side hook ----------

/** Creates the customer for `phone` or refreshes name/region to the latest order's. Returns the customer id. Never touches `blocked`. */
export async function upsertCustomerFromOrder(tx: Db, i: { phone: string; name: string; region: string }): Promise<number> {
  const c = await tx.customer.upsert({
    where: { phone: i.phone },
    update: { name: i.name, region: i.region },
    create: { phone: i.phone, name: i.name, region: i.region, tags: [] },
    select: { id: true },
  })
  return c.id
}

// ---------- reading ----------

export type CustomerSort = 'last' | 'spent' | 'orders' | 'name'
const SORTS: CustomerSort[] = ['last', 'spent', 'orders', 'name']
export const isCustomerSort = (v: unknown): v is CustomerSort => typeof v === 'string' && (SORTS as string[]).includes(v)

export type CustomerQuery = { q?: string; segment?: Segment; sort?: CustomerSort }

export type CustomerRow = {
  id: number
  phone: string
  name: string
  region: string
  notes: string
  tags: string[]
  blocked: boolean
  createdAt: Date
  /** CONFIRMED + DELIVERED orders */
  orders: number
  /** Sum of CONFIRMED + DELIVERED orders */
  spentUzs: number
  /** Latest non-cancelled order */
  lastOrderAt: Date | null
  segment: Segment
}

const toTags = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

async function statsByPhone(): Promise<Map<string, { orders: number; spentUzs: number; lastOrderAt: Date | null }>> {
  const [revenue, last] = await Promise.all([
    prisma.order.groupBy({ by: ['phone'], where: { status: { in: REVENUE } }, _count: { _all: true }, _sum: { totalUzs: true } }),
    prisma.order.groupBy({ by: ['phone'], where: { status: { not: 'CANCELLED' } }, _max: { createdAt: true } }),
  ])
  const out = new Map<string, { orders: number; spentUzs: number; lastOrderAt: Date | null }>()
  const slot = (phone: string) => {
    let s = out.get(phone)
    if (!s) out.set(phone, (s = { orders: 0, spentUzs: 0, lastOrderAt: null }))
    return s
  }
  for (const r of revenue) {
    const s = slot(r.phone)
    s.orders = r._count._all
    s.spentUzs = r._sum.totalUzs ?? 0
  }
  for (const r of last) slot(r.phone).lastOrderAt = r._max.createdAt
  return out
}

function searchWhere(q: string | undefined): Prisma.CustomerWhereInput {
  const term = typeof q === 'string' ? q.trim().slice(0, 100) : ''
  if (!term) return {}
  const or: Prisma.CustomerWhereInput[] = [{ name: { contains: term } }]
  // Phone numbers are stored as +998XXXXXXXXX: a digits-only search matches any fragment, however it was typed.
  if (/^[\d\s+().-]+$/.test(term)) {
    const digits = term.replace(/\D/g, '')
    if (digits) or.push({ phone: { contains: digits } })
  }
  return { OR: or }
}

const time = (d: Date | null) => (d ? d.getTime() : -Infinity)
const COMPARE: Record<CustomerSort, (a: CustomerRow, b: CustomerRow) => number> = {
  last: (a, b) => time(b.lastOrderAt) - time(a.lastOrderAt),
  spent: (a, b) => b.spentUzs - a.spentUzs,
  orders: (a, b) => b.orders - a.orders,
  name: (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
}

/** Every matching client with stats, segment filter and sort applied (no paging). Stats are aggregated in SQL; the rest is in memory. */
async function loadRows(query: CustomerQuery, now: Date): Promise<CustomerRow[]> {
  const [customers, stats, settings] = await Promise.all([
    prisma.customer.findMany({ where: searchWhere(query.q) }),
    statsByPhone(),
    getSettings(),
  ])
  const segment = isSegment(query.segment) ? query.segment : undefined
  const sort = isCustomerSort(query.sort) ? query.sort : 'last'
  const rows: CustomerRow[] = []
  for (const c of customers) {
    const s = stats.get(c.phone) ?? { orders: 0, spentUzs: 0, lastOrderAt: null }
    const seg = segmentOf(s, settings.vipThresholdUzs, now)
    if (segment && seg !== segment) continue
    rows.push({
      id: c.id, phone: c.phone, name: c.name, region: c.region, notes: c.notes, tags: toTags(c.tags), blocked: c.blocked,
      createdAt: c.createdAt, ...s, segment: seg,
    })
  }
  return rows.sort((a, b) => COMPARE[sort](a, b) || b.id - a.id)
}

export async function listCustomers(
  query: CustomerQuery & { page: number },
  now: Date = new Date(),
): Promise<{ rows: CustomerRow[]; total: number }> {
  const all = await loadRows(query, now)
  const page = Number.isInteger(query.page) && query.page > 0 ? query.page : 1
  return { rows: all.slice((page - 1) * CUSTOMERS_PAGE_SIZE, page * CUSTOMERS_PAGE_SIZE), total: all.length }
}

export type CustomerOrder = { id: number; number: number; status: string; totalUzs: number; createdAt: Date }
export type CustomerDetail = CustomerRow & { history: CustomerOrder[] }

export async function getCustomer(id: number, now: Date = new Date()): Promise<CustomerDetail | null> {
  const c = await prisma.customer.findUnique({ where: { id } })
  if (!c) return null
  const [history, stats, settings] = await Promise.all([
    prisma.order.findMany({
      where: { phone: c.phone },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, number: true, status: true, totalUzs: true, createdAt: true },
    }),
    prisma.order.findMany({ where: { phone: c.phone, status: { not: 'CANCELLED' } }, select: { status: true, totalUzs: true, createdAt: true } }),
    getSettings(),
  ])
  let orders = 0
  let spentUzs = 0
  let lastOrderAt: Date | null = null
  for (const o of stats) {
    if (REVENUE.includes(o.status)) {
      orders++
      spentUzs += o.totalUzs
    }
    if (!lastOrderAt || o.createdAt > lastOrderAt) lastOrderAt = o.createdAt
  }
  const s = { orders, spentUzs, lastOrderAt }
  return {
    id: c.id, phone: c.phone, name: c.name, region: c.region, notes: c.notes, tags: toTags(c.tags), blocked: c.blocked, createdAt: c.createdAt,
    ...s, segment: segmentOf(s, settings.vipThresholdUzs, now), history,
  }
}

// ---------- writing ----------

export type CustomerPatch = { notes?: string; tags?: string[]; blocked?: boolean }
export type CustomerResult = { ok: true } | { ok: false; error: string }

export async function updateCustomer(id: number, patch: CustomerPatch, actor: Staff): Promise<CustomerResult> {
  if (!Number.isInteger(id) || !patch || typeof patch !== 'object') return { ok: false, error: 'Client not found.' }
  const data: Prisma.CustomerUpdateInput = {}

  if (patch.notes !== undefined) {
    if (typeof patch.notes !== 'string') return { ok: false, error: 'Notes must be text.' }
    const notes = patch.notes.trim()
    if (notes.length > MAX_NOTES) return { ok: false, error: `Notes can be at most ${MAX_NOTES} characters.` }
    data.notes = notes
  }
  if (patch.tags !== undefined) {
    if (!Array.isArray(patch.tags) || patch.tags.some((t) => typeof t !== 'string')) return { ok: false, error: 'Tags must be a list of text.' }
    const tags = [...new Set(patch.tags.map((t) => t.trim()).filter(Boolean))]
    if (tags.some((t) => t.length > MAX_TAG_LEN)) return { ok: false, error: `A tag can be at most ${MAX_TAG_LEN} characters.` }
    if (tags.length > MAX_TAGS) return { ok: false, error: `At most ${MAX_TAGS} tags.` }
    data.tags = tags
  }
  if (patch.blocked !== undefined) {
    if (typeof patch.blocked !== 'boolean') return { ok: false, error: 'Invalid blocked value.' }
    data.blocked = patch.blocked
  }

  const c = await prisma.customer.findUnique({ where: { id } })
  if (!c) return { ok: false, error: 'Client not found.' }

  const changed: string[] = []
  if (data.notes !== undefined && data.notes !== c.notes) changed.push('notes')
  if (data.tags !== undefined && JSON.stringify(data.tags) !== JSON.stringify(toTags(c.tags))) changed.push('tags')
  if (data.blocked !== undefined && data.blocked !== c.blocked) changed.push(`blocked=${data.blocked}`)
  if (changed.length === 0) return { ok: true }

  await prisma.customer.update({ where: { id }, data })
  await logActivity(actor, 'update', 'customer', id, `Client ${c.phone} (${c.name}): ${changed.join(', ')}`)
  return { ok: true }
}

// ---------- CSV ----------

const CSV_HEADER = ['Name', 'Phone', 'Region', 'Segment', 'Orders', 'Spent (UZS)', 'Last order', 'Blocked', 'Tags', 'Notes']

/** Free text is customer-supplied: a leading = + - @ would run as a spreadsheet formula, so it is defused with an apostrophe. */
function cell(v: string, freeText = true): string {
  const s = freeText && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** UTF-8 (with BOM, for Excel), `;`-separated, CRLF lines. Same filters/sort as the list, all pages. */
export async function customersCsv(query: CustomerQuery, now: Date = new Date()): Promise<string> {
  const rows = await loadRows(query, now)
  const lines = [CSV_HEADER.join(';')]
  for (const r of rows) {
    lines.push(
      [
        cell(r.name),
        cell(r.phone, false),
        cell(r.region, false),
        r.segment,
        String(r.orders),
        String(r.spentUzs),
        r.lastOrderAt ? tashkentDay(r.lastOrderAt) : '',
        r.blocked ? 'yes' : 'no',
        cell(r.tags.join(', ')),
        cell(r.notes),
      ].join(';'),
    )
  }
  return `﻿${lines.join('\r\n')}\r\n`
}
