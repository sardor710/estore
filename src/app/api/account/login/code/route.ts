import type { NextRequest } from 'next/server'
import { isSameOrigin } from '@/lib/admin/csrf'
import { clientKey } from '@/lib/rate-limit'
import { readJsonBody } from '@/lib/body-limit'
import { requestLoginCode } from '@/lib/account/codes'
import { sendCustomerMessage } from '@/lib/telegram-bot/api'
import { runAfterResponse } from '@/lib/after-response'
import { json, forbidden, rateLimited, padTo } from '../../_lib'

export const dynamic = 'force-dynamic'

/** Minimum duration of a code request whose outcome must not be distinguishable ('sent' vs 'not_linked'). */
const UNIFORM_MS = 600

/**
 * POST /api/account/login/code { phone } -> 200 { ok: true } for a linked phone, an unlinked one and a failed
 * Telegram send alike (same body, padded to the same minimum time; the Telegram message is sent after the
 * response, so timing never depends on Telegram: no account enumeration). A failed send burns the code.
 * 400 { error: 'BAD_PHONE' } | 429 { error: 'RATE_LIMITED' } | 403 cross-origin.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req.headers, req.method)) return forbidden()
  const startedAt = Date.now()
  try {
    const body = await readJsonBody(req)
    const b = body.ok ? (body.value as Record<string, unknown> | null) : null
    const phone = b && typeof b === 'object' && typeof b.phone === 'string' ? b.phone : ''
    const r = await requestLoginCode(phone, clientKey(req.headers), (chatId, text) => sendCustomerMessage(chatId, text), new Date(), {
      schedule: runAfterResponse,
    })
    switch (r) {
      case 'bad_phone':
        return json({ error: 'BAD_PHONE' }, 400)
      case 'rate_limited':
        return rateLimited(900)
      default: // 'sent' (queued) | 'not_linked' | 'phone_limited' | 'send_failed' — all look the same (no enumeration)
        await padTo(startedAt, UNIFORM_MS)
        return json({ ok: true })
    }
  } catch (e) {
    console.error('[account] login code failed', e)
    return json({ error: 'SERVER' }, 500)
  }
}
