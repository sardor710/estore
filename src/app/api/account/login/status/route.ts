import type { NextRequest } from 'next/server'
import { collectLogin } from '@/lib/account/login'
import { issueCustomerSession, setCustomerCookie } from '@/lib/account/session'
import { json, rateLimited, statusLimiter, statusKey, parseLoginCookie, LOGIN_COOKIE, LOGIN_COOKIE_OPTIONS } from '../../_lib'

export const dynamic = 'force-dynamic'

/**
 * GET /api/account/login/status (polled by the login page; reads the `customer_login` cookie)
 * -> { state: 'pending' | 'expired' | 'denied' | 'done' }. On 'done' the `customer_session` cookie is set and
 * `customer_login` cleared; 'expired' also clears it. 'denied' = this browser does not hold the login's secret.
 * Without a well-formed cookie -> 'expired' straight away (no DB, not counted). Limit: 60 polls/min per sign-in
 * (keyed by the login token's hash, not by IP: without TRUST_PROXY every client shares one IP key).
 */
export async function GET(req: NextRequest) {
  const login = parseLoginCookie(req.cookies.get(LOGIN_COOKIE)?.value)
  if (!login) return json({ state: 'expired' })
  if (statusLimiter.reserve(statusKey(login.token)) === null) return rateLimited(60)
  try {
    const clear = (res: ReturnType<typeof json>) => {
      res.cookies.set(LOGIN_COOKIE, '', { ...LOGIN_COOKIE_OPTIONS, maxAge: 0 })
      return res
    }
    const r = await collectLogin(login.token, login.browserSecret)
    if (r === 'pending' || r === 'denied') return json({ state: r })
    if (r === 'expired') return clear(json({ state: 'expired' }))
    const token = await issueCustomerSession(r.customerId)
    if (!token) return clear(json({ state: 'expired' }))
    const res = clear(json({ state: 'done' }))
    await setCustomerCookie(res.cookies, token)
    return res
  } catch (e) {
    console.error('[account] login status failed', e)
    return json({ error: 'SERVER' }, 500)
  }
}
