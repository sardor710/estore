/**
 * Order → ERPNext stock movements, via an outbox table so a down ERP never blocks the shop and
 * nothing is pushed twice.
 *   NEW → CONFIRMED                 DELIVER  (submitted Delivery Note)          ref ZK-<orderId>
 *   CONFIRMED/SHIPPING → CANCELLED  RETURN   (return Delivery Note)             ref ZK-<orderId>-R
 *                                   or SKIPPED when the DELIVER never reached ERP
 *                                   or RECEIPT (Material Receipt) for orders confirmed before the switch-over
 */
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/db'
import { ERP, parseLines, type OutboxLine } from './core'
import { erpEnabled, erpInsert, erpList, ErpError } from './client'
import { refreshFromErp } from './apply'

type Tx = Prisma.TransactionClient
type OrderForOutbox = { id: number; lines: { variantId: number; sku: string; qty: number; priceUzs: number }[] }

/** Outbox rows are written only while the sync flag is on (checked at write time). */
export function erpFlagOn(): boolean {
  return process.env.ERP_ENABLED === '1'
}

/** Lines for ERP-linked variants only (an unknown item would make ERP reject the whole document). */
async function linesOf(tx: Tx, order: OrderForOutbox): Promise<OutboxLine[]> {
  const linked = new Set(
    (await tx.variant.findMany({ where: { id: { in: order.lines.map((l) => l.variantId) }, erpLinkedAt: { not: null } }, select: { id: true } })).map((v) => v.id),
  )
  const by = new Map<string, OutboxLine>()
  for (const l of order.lines) {
    if (!linked.has(l.variantId)) continue
    const cur = by.get(l.sku)
    if (cur) cur.qty += l.qty
    else by.set(l.sku, { sku: l.sku, qty: l.qty, rateUzs: l.priceUzs })
  }
  return [...by.values()]
}

/** Was this order confirmed before ERP took over stock (so ERP's opening stock already excludes it)? */
async function confirmedBeforeCutover(tx: Tx, orderId: number): Promise<boolean> {
  const cut = await tx.setting.findUnique({ where: { key: 'erp.cutoverAt' } })
  if (!cut) return true
  const ev = await tx.orderStatusEvent.findFirst({ where: { orderId, status: 'CONFIRMED' }, orderBy: { id: 'desc' }, select: { createdAt: true } })
  return !ev || ev.createdAt.getTime() < new Date(cut.value).getTime()
}

/** Call inside the order-status transaction, after stock was moved locally. Returns true when a row was queued. */
export async function enqueueForStatus(tx: Tx, order: OrderForOutbox, from: string, to: string): Promise<boolean> {
  if (!erpFlagOn()) return false
  if (from === 'NEW' && to === 'CONFIRMED') {
    const lines = await linesOf(tx, order)
    if (!lines.length) return false
    await tx.erpOutbox.create({ data: { ref: `ZK-${order.id}`, kind: 'DELIVER', orderId: order.id, lines } })
    return true
  }
  if ((from === 'CONFIRMED' || from === 'SHIPPING') && to === 'CANCELLED') {
    const deliver = await tx.erpOutbox.findUnique({ where: { ref: `ZK-${order.id}` } })
    if (deliver) {
      // Never sent at all: drop it. Anything else may already exist in ERP (e.g. a timeout after ERP
      // committed), so queue a RETURN; the drain checks ERP before returning (or skips both).
      if (deliver.status === 'PENDING' && deliver.attempts === 0) {
        const r = await tx.erpOutbox.updateMany({ where: { id: deliver.id, status: 'PENDING', attempts: 0 }, data: { status: 'SKIPPED' } })
        if (r.count === 1) return false
      }
      if (deliver.status === 'SKIPPED') return false
      await tx.erpOutbox.create({ data: { ref: `ZK-${order.id}-R`, kind: 'RETURN', orderId: order.id, lines: parseLines(deliver.lines) } })
      return true
    }
    // No DELIVER: either confirmed before the cutover (ERP's opening stock excludes it → give it back),
    // or confirmed while sync was off after the cutover (ERP never saw it → nothing to do).
    if (!(await confirmedBeforeCutover(tx, order.id))) return false
    const lines = await linesOf(tx, order)
    if (!lines.length) return false
    await tx.erpOutbox.create({ data: { ref: `ZK-${order.id}-R`, kind: 'RECEIPT', orderId: order.id, lines } })
    return true
  }
  return false
}

// ---------- drain ----------

/** Longer than the worst push (3 requests × 15 s timeout), so a live push never loses its lock. */
const LOCK_MS = 5 * 60_000
const MAX_BACKOFF_MIN = 60
const MAX_ROWS_PER_DRAIN = 50

type Row = { id: number; ref: string; kind: string; orderId: number; lines: unknown; attempts: number }

class Wait extends Error {}
class Skip extends Error {}

function doctypeOf(kind: string): string {
  return kind === 'RECEIPT' ? 'Stock Entry' : 'Delivery Note'
}

async function findByRef(doctype: string, ref: string): Promise<{ name: string; docstatus: number } | null> {
  const rows = await erpList<{ name: string; docstatus: number }>(doctype, [['zanko_order_ref', '=', ref]], ['name', 'docstatus'])
  return rows[0] ?? null
}

function buildDoc(row: Row, returnAgainst: string | null): Record<string, unknown> {
  const lines = parseLines(row.lines)
  if (row.kind === 'RECEIPT') {
    return {
      stock_entry_type: 'Material Receipt',
      company: ERP.company,
      docstatus: 1,
      zanko_order_ref: row.ref,
      remarks: `zanko.uz order #${row.orderId} cancelled (confirmed before ERP sync)`,
      items: lines.map((l) => ({ item_code: l.sku, qty: l.qty, t_warehouse: ERP.warehouse, basic_rate: 0, allow_zero_valuation_rate: 1 })),
    }
  }
  const isReturn = row.kind === 'RETURN'
  return {
    customer: ERP.customer,
    company: ERP.company,
    docstatus: 1,
    zanko_order_ref: row.ref,
    set_warehouse: ERP.warehouse,
    selling_price_list: ERP.priceList,
    currency: ERP.currency,
    remarks: `zanko.uz order #${row.orderId}${isReturn ? ' cancelled' : ''}`,
    ...(isReturn ? { is_return: 1, return_against: returnAgainst } : {}),
    items: lines.map((l) => ({
      item_code: l.sku,
      qty: isReturn ? -l.qty : l.qty,
      rate: l.rateUzs,
      warehouse: ERP.warehouse,
      allow_zero_valuation_rate: 1,
    })),
  }
}

/**
 * The Delivery Note a RETURN goes against. When our DELIVER row is not DONE, ERP is asked: it may
 * hold the note after a timeout (adopt it), or never have got it (skip both rows: nothing to undo).
 */
async function deliveryFor(orderId: number, now: Date): Promise<string> {
  const deliver = await prisma.erpOutbox.findUnique({ where: { ref: `ZK-${orderId}` } })
  if (!deliver) throw new ErpError(`no delivery row for order ${orderId}`, 0, false)
  if (deliver.status === 'DONE' && deliver.erpDoc) return deliver.erpDoc
  if (deliver.status === 'RUNNING' && deliver.lockedUntil && deliver.lockedUntil > now) throw new Wait('waiting for the delivery push in progress')
  const inErp = await findByRef('Delivery Note', deliver.ref)
  if (inErp?.docstatus === 1) {
    await prisma.erpOutbox.updateMany({
      where: { id: deliver.id, status: { in: ['PENDING', 'FAILED', 'RUNNING'] } },
      data: { status: 'DONE', erpDoc: inErp.name, lockedUntil: null, lastError: null },
    })
    return inErp.name
  }
  if (inErp) throw new ErpError(`Delivery Note ${inErp.name} for ${deliver.ref} is ${inErp.docstatus === 2 ? 'cancelled' : 'a draft'} in ERP`, 0, false)
  const r = await prisma.erpOutbox.updateMany({ where: { id: deliver.id, status: { in: ['PENDING', 'FAILED', 'RUNNING'] } }, data: { status: 'SKIPPED', lockedUntil: null } })
  if (r.count === 1) throw new Skip('delivery never reached ERP; nothing to return')
  throw new Wait('delivery row changed meanwhile')
}

async function push(row: Row, now: Date): Promise<string> {
  const doctype = doctypeOf(row.kind)
  const existing = await findByRef(doctype, row.ref)
  if (existing) {
    if (existing.docstatus === 1) return existing.name
    throw new ErpError(`${doctype} ${existing.name} for ${row.ref} exists in ERP but is ${existing.docstatus === 2 ? 'cancelled' : 'a draft'}`, 0, false)
  }
  const returnAgainst = row.kind === 'RETURN' ? await deliveryFor(row.orderId, now) : null
  try {
    return (await erpInsert<{ name: string }>(doctype, buildDoc(row, returnAgainst))).name
  } catch (e) {
    // Created by a parallel or earlier attempt between our lookup and insert: adopt it.
    if (e instanceof ErpError && e.excType === 'UniqueValidationError') {
      const again = await findByRef(doctype, row.ref)
      if (again?.docstatus === 1) return again.name
    }
    throw e
  }
}

/** Claims the next due row; the lock value doubles as this drain's ownership token. */
async function claimOne(now: Date, skip: Set<number>): Promise<{ row: Row; lock: Date } | null> {
  for (;;) {
    const c = await prisma.erpOutbox.findFirst({
      where: {
        id: { notIn: [...skip] },
        OR: [
          { status: 'PENDING', nextAttemptAt: { lte: now } },
          { status: 'RUNNING', lockedUntil: { lt: now } },
        ],
      },
      orderBy: { id: 'asc' },
    })
    if (!c) return null
    const lock = new Date(Date.now() + LOCK_MS + Math.floor(Math.random() * 1000))
    const r = await prisma.erpOutbox.updateMany({
      where: { id: c.id, status: c.status, lockedUntil: c.lockedUntil, nextAttemptAt: c.nextAttemptAt },
      data: { status: 'RUNNING', lockedUntil: lock },
    })
    if (r.count === 1) return { row: c, lock }
    skip.add(c.id) // someone else got it
  }
}

export type DrainResult = { done: number; failed: number; pending: number }

const countPending = () => prisma.erpOutbox.count({ where: { status: { in: ['PENDING', 'RUNNING'] } } })

/** Pushes due outbox rows to ERPNext. Safe to run concurrently (rows are claimed one by one with a lock). */
export async function drainOutbox(now: Date = new Date()): Promise<DrainResult> {
  const out: DrainResult = { done: 0, failed: 0, pending: 0 }
  if (!erpEnabled()) return { ...out, pending: await countPending() }
  const seen = new Set<number>()
  for (let n = 0; n < MAX_ROWS_PER_DRAIN; n++) {
    const claimed = await claimOne(now, seen)
    if (!claimed) break
    const { row, lock } = claimed
    seen.add(row.id)
    const mine = { id: row.id, status: 'RUNNING', lockedUntil: lock }
    try {
      const erpDoc = await push(row, now)
      const w = await prisma.erpOutbox.updateMany({ where: mine, data: { status: 'DONE', erpDoc, lockedUntil: null, lastError: null } })
      if (w.count === 1) out.done++
      // Show ERP's figure (which now includes this movement) right away instead of at the next reconcile.
      await refreshFromErp(parseLines(row.lines).map((l) => l.sku)).catch(() => {})
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (e instanceof Skip) {
        await prisma.erpOutbox.updateMany({ where: mine, data: { status: 'SKIPPED', lockedUntil: null, lastError: message } })
      } else if (e instanceof ErpError && !e.transient) {
        const w = await prisma.erpOutbox.updateMany({ where: mine, data: { status: 'FAILED', attempts: row.attempts + 1, lockedUntil: null, lastError: message.slice(0, 1000) } })
        if (w.count === 1) out.failed++
      } else {
        // Transient: ERP down, timeout, or anything unexpected (never assume it did not reach ERP).
        const attempts = row.attempts + 1
        const delayMin = Math.min(2 ** attempts, MAX_BACKOFF_MIN)
        await prisma.erpOutbox.updateMany({
          where: mine,
          data: { status: 'PENDING', attempts, lockedUntil: null, lastError: message.slice(0, 1000), nextAttemptAt: new Date(now.getTime() + delayMin * 60_000) },
        })
      }
    }
  }
  out.pending = await countPending()
  return out
}

/** Admin "Retry": puts a FAILED row back in the queue. */
export async function retryOutbox(id: number): Promise<boolean> {
  const r = await prisma.erpOutbox.updateMany({ where: { id, status: 'FAILED' }, data: { status: 'PENDING', nextAttemptAt: new Date(), lockedUntil: null } })
  return r.count === 1
}
