import { NextResponse } from 'next/server'
import { erpEnabled } from '@/lib/erp/client'
import { verifyErpSignature } from '@/lib/erp/core'
import { refreshFromErp } from '@/lib/erp/apply'

export const dynamic = 'force-dynamic'

const MAX_BODY = 16 * 1024

/**
 * ERPNext webhook (Stock Ledger Entry / Item Price of company Zanko). The body only says which item
 * changed; the real stock and price are re-read from the ERP, so a replayed call cannot set values.
 */
export async function POST(req: Request) {
  const raw = await req.text()
  if (raw.length > MAX_BODY) return NextResponse.json({ ok: false }, { status: 413 })
  if (!verifyErpSignature(raw, req.headers.get('x-frappe-webhook-signature'), process.env.ERP_WEBHOOK_SECRET ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  if (!erpEnabled()) return NextResponse.json({ ok: true, skipped: 'disabled' })
  let itemCode = ''
  try {
    const b = JSON.parse(raw) as { item_code?: unknown }
    itemCode = typeof b.item_code === 'string' ? b.item_code.trim() : ''
  } catch {
    /* ignore */
  }
  if (!itemCode) return NextResponse.json({ ok: false }, { status: 400 })
  try {
    const r = await refreshFromErp([itemCode])
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    console.error('[erp] webhook refresh failed', itemCode, e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false }, { status: 502 })
  }
}
