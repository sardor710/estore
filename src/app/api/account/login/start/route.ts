import type { NextRequest } from 'next/server'
import QRCode from 'qrcode'
import { isSameOrigin } from '@/lib/admin/csrf'
import { clientKey } from '@/lib/rate-limit'
import { startLogin } from '@/lib/account/login'
import { getBotUsername } from '@/lib/telegram-bot/api'
import { json, forbidden, rateLimited, startLimiter, LOGIN_COOKIE, LOGIN_COOKIE_OPTIONS } from '../../_lib'

export const dynamic = 'force-dynamic'

/**
 * POST /api/account/login/start -> 200 { checkCode, deepLink, qrSvg, expiresAt } + httpOnly `customer_login` cookie.
 * The raw login token appears only inside `deepLink` (t.me/<bot>?start=login_<token>).
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req.headers, req.method)) return forbidden()
  if (startLimiter.reserve(clientKey(req.headers)) === null) return rateLimited(600)
  try {
    const username = await getBotUsername()
    if (!username) return json({ error: 'BOT_NOT_CONFIGURED' }, 503)
    const s = await startLogin()
    const deepLink = `https://t.me/${username}?start=login_${s.token}`
    const qrSvg = await QRCode.toString(deepLink, { type: 'svg', margin: 1 })
    const res = json({ checkCode: s.checkCode, deepLink, qrSvg, expiresAt: s.expiresAt.toISOString() })
    res.cookies.set(LOGIN_COOKIE, `${s.token}.${s.browserSecret}`, { ...LOGIN_COOKIE_OPTIONS })
    return res
  } catch (e) {
    console.error('[account] login start failed', e)
    return json({ error: 'SERVER' }, 500)
  }
}
