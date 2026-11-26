import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/db'
import { erpEnabled } from '@/lib/erp/client'
import { drainOutbox } from '@/lib/erp/outbox'
import { ensureErpItems } from '@/lib/erp/items'
import { refreshFromErp } from '@/lib/erp/apply'

export const dynamic = 'force-dynamic'

const RECONCILE_EVERY_MS = 5 * 60_000

const sameToken = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

let running: Promise<unknown> | null = null

const step = async <T,>(name: string, f: () => Promise<T>): Promise<T | { error: string }> => {
  try {
    return await f()
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error(`[erp] sync step ${name} failed:`, error)
    return { error }
  }
}

/** Each step stands alone: one failing (e.g. ERP refuses a new category) never blocks the others. */
async function runSync(full: boolean) {
  const outbox = await step('outbox', () => drainOutbox())
  const last = await prisma.setting.findUnique({ where: { key: 'erp.lastReconcileAt' } })
  const due = full || !last || Date.now() - new Date(last.value).getTime() >= RECONCILE_EVERY_MS
  const reconcile = due ? await step('reconcile', () => refreshFromErp()) : null
  const items = await step('items', () => ensureErpItems({ withImages: true })) // new SKUs only; slow with photos, so last
  return { outbox, items, reconcile }
}

/** Called every minute by zanko-erp-sync.timer (localhost, bearer token). */
export async function POST(req: Request) {
  const token = process.env.ERP_SYNC_TOKEN ?? ''
  const auth = req.headers.get('authorization') ?? ''
  if (!token || !sameToken(auth, `Bearer ${token}`)) return NextResponse.json({ ok: false }, { status: 401 })
  if (!erpEnabled()) return NextResponse.json({ ok: true, skipped: 'disabled' })
  if (running) return NextResponse.json({ ok: true, skipped: 'already running' })
  const full = new URL(req.url).searchParams.get('full') === '1'
  const job = runSync(full)
  running = job
  try {
    return NextResponse.json({ ok: true, ...(await job) })
  } catch (e) {
    console.error('[erp] sync failed', e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  } finally {
    running = null
  }
}
