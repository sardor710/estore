import type { NextRequest } from 'next/server'
import { isSameOrigin } from '@/lib/admin/csrf'
import { readJsonBody } from '@/lib/body-limit'
import { CUSTOMER_COOKIE, customerFromToken, clearCustomerCookie } from '@/lib/account/session'
import { signOutEverywhere } from '@/lib/account/profile'
import { TG_MODE_COOKIE } from '@/lib/tg/mode'
import { json, forbidden } from '../_lib'

export const dynamic = 'force-dynamic'

/**
 * POST /api/account/logout { everywhere?: boolean } (body optional) -> 200 { ok: true }, `customer_session` cleared.
 * `everywhere: true` with a valid session also revokes every other session (sessionVersion++). 403 cross-origin.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req.headers, req.method)) return forbidden()
  const telegram = req.cookies.get(TG_MODE_COOKIE)?.value === '1'
  try {
    const body = req.headers.get('content-length') === '0' ? null : await readJsonBody(req)
    const b = body?.ok ? (body.value as Record<string, unknown> | null) : null
    if (b && typeof b === 'object' && b.everywhere === true) {
      const c = await customerFromToken(req.cookies.get(CUSTOMER_COOKIE)?.value)
      if (c) await signOutEverywhere(c.id)
    }
  } catch (e) {
    // still sign this browser out, but never claim the other sessions were revoked
    console.error('[account] sign out everywhere failed', e)
    const res = json({ error: 'SERVER' }, 500)
    await clearCustomerCookie(res.cookies, { telegram })
    return res
  }
  const res = json({ ok: true })
  await clearCustomerCookie(res.cookies, { telegram })
  return res
}
