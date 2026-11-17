import type { NextRequest } from 'next/server'
import { isSameOrigin } from '@/lib/admin/csrf'
import { clientKey } from '@/lib/rate-limit'
import { readJsonBody } from '@/lib/body-limit'
import { verifyLoginCode } from '@/lib/account/codes'
import { issueCustomerSession, setCustomerCookie } from '@/lib/account/session'
import { json, forbidden, rateLimited, verifyLimiter } from '../../_lib'

export const dynamic = 'force-dynamic'

/**
 * POST /api/account/login/verify { phone, code } -> 200 { ok: true } + `customer_session` cookie;
 * 400 { error: 'invalid' } for every failure (wrong, expired, locked after 5 attempts, unknown phone: no account
 * enumeration; attempts are still counted and locked codes stay locked); 429 { error: 'RATE_LIMITED' }; 403 cross-origin.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req.headers, req.method)) return forbidden()
  if (verifyLimiter.reserve(clientKey(req.headers)) === null) return rateLimited(900)
  try {
    const body = await readJsonBody(req)
    const b = body.ok ? (body.value as Record<string, unknown> | null) : null
    if (!b || typeof b !== 'object' || typeof b.phone !== 'string' || typeof b.code !== 'string') return json({ error: 'invalid' }, 400)
    const r = await verifyLoginCode(b.phone, b.code.trim())
    if (typeof r === 'string') return json({ error: 'invalid' }, 400)
    const token = await issueCustomerSession(r.customerId)
    if (!token) return json({ error: 'invalid' }, 400)
    const res = json({ ok: true })
    await setCustomerCookie(res.cookies, token)
    return res
  } catch (e) {
    console.error('[account] login verify failed', e)
    return json({ error: 'SERVER' }, 500)
  }
}
