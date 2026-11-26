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

type Tx = Prisma.TransactionClient
type OrderForOutbox = { id: number; lines: { sku: string; qty: number; priceUzs: number }[] }

/** Outbox rows are written only while the sync flag is on (checked at write time). */
export function erpFlagOn(): boolean {
  return process.env.ERP_ENABLED === '1'
}

function linesOf(order: OrderForOutbox): OutboxLine[] {
  const by = new Map<string, OutboxLine>()
  for (const l of order.lines) {
    const cur = by.get(l.sku)
    if (cur) cur.qty += l.qty
    else by.set(l.sku, { sku: l.sku, qty: l.qty, rateUzs: l.priceUzs })
  }
  return [...by.values()]
}

/** Call inside the order-status transaction, after stock was moved locally. */
export async function enqueueForStatus(tx: Tx, order: OrderForOutbox, from: string, to: string): Promise<boolean> {
  if (!erpFlagOn()) return false
  if (from === 'NEW' && to === 'CONFIRMED') {
    await tx.erpOutbox.create({ data: { ref: `ZK-${order.id}`, kind: 'DELIVER', orderId: order.id, lines: linesOf(order) } })
    return true
  }
  if ((from === 'CONFIRMED' || from === 'SHIPPING') && to === 'CANCELLED') {
    const deliver = await tx.erpOutbox.findUnique({ where: { ref: `ZK-${order.id}` } })
    if (deliver && (deliver.status === 'PENDING' || deliver.status === 'FAILED')) {
      // Never reached ERP: drop it instead of pushing a delivery and its return.
      const r = await tx.erpOutbox.updateMany({ where: { id: deliver.id, status: deliver.status }, data: { status: 'SKIPPED' } })
      if (r.count === 1) return false
    }
    const kind = deliver ? 'RETURN' : 'RECEIPT'
    await tx.erpOutbox.create({ data: { ref: `ZK-${order.id}-R`, kind, orderId: order.id, lines: linesOf(order) } })
    return true
  }
  return false
}

// ---------- drain ----------

const LOCK_MS = 60_000
const MAX_BACKOFF_MIN = 60

type Row = { id: number; ref: string; kind: string; orderId: number; lines: unknown; attempts: number }

class Wait extends Error {}

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

async function push(row: Row): Promise<string> {
  const doctype = doctypeOf(row.kind)
  const existing = await findByRef(doctype, row.ref)
  if (existing) {
    if (existing.docstatus === 1) return existing.name
    throw new ErpError(`${doctype} ${existing.name} for ${row.ref} exists in ERP but is ${existing.docstatus === 2 ? 'cancelled' : 'a draft'}`, 0, false)
  }
  let returnAgainst: string | null = null
  if (row.kind === 'RETURN') {
    const deliver = await prisma.erpOutbox.findUnique({ where: { ref: `ZK-${row.orderId}` } })
    if (!deliver || deliver.status !== 'DONE' || !deliver.erpDoc) throw new Wait('waiting for the delivery to reach ERP')
    returnAgainst = deliver.erpDoc
  }
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

async function claim(now: Date): Promise<Row[]> {
  const candidates = await prisma.erpOutbox.findMany({
    where: {
      OR: [
        { status: 'PENDING', nextAttemptAt: { lte: now } },
        { status: 'RUNNING', lockedUntil: { lt: now } },
      ],
    },
    orderBy: { id: 'asc' },
    take: 50,
  })
  const mine: Row[] = []
  for (const c of candidates) {
    const r = await prisma.erpOutbox.updateMany({
      where: { id: c.id, status: c.status, lockedUntil: c.lockedUntil, nextAttemptAt: c.nextAttemptAt },
      data: { status: 'RUNNING', lockedUntil: new Date(now.getTime() + LOCK_MS) },
    })
    if (r.count === 1) mine.push(c)
  }
  return mine
}

export type DrainResult = { done: number; failed: number; pending: number }

const countPending = () => prisma.erpOutbox.count({ where: { status: { in: ['PENDING', 'RUNNING'] } } })

/** Pushes due outbox rows to ERPNext. Safe to run concurrently (rows are claimed with a lock). */
export async function drainOutbox(now: Date = new Date()): Promise<DrainResult> {
  const out: DrainResult = { done: 0, failed: 0, pending: 0 }
  if (!erpEnabled()) return { ...out, pending: await countPending() }
  for (const row of await claim(now)) {
    try {
      const erpDoc = await push(row)
      await prisma.erpOutbox.update({ where: { id: row.id }, data: { status: 'DONE', erpDoc, lockedUntil: null, lastError: null } })
      out.done++
    } catch (e) {
      const transient = e instanceof Wait || (e instanceof ErpError && e.transient)
      const message = e instanceof Error ? e.message : String(e)
      if (transient) {
        const attempts = row.attempts + 1
        const delayMin = Math.min(2 ** attempts, MAX_BACKOFF_MIN)
        await prisma.erpOutbox.update({
          where: { id: row.id },
          data: { status: 'PENDING', attempts, lockedUntil: null, lastError: message.slice(0, 1000), nextAttemptAt: new Date(now.getTime() + delayMin * 60_000) },
        })
      } else {
        await prisma.erpOutbox.update({
          where: { id: row.id },
          data: { status: 'FAILED', attempts: row.attempts + 1, lockedUntil: null, lastError: message.slice(0, 1000) },
        })
        out.failed++
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
