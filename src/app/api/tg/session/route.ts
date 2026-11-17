import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { clientKey } from '@/lib/rate-limit'
import { locales, type Locale } from '@/i18n/routing'
import { CUSTOMER_COOKIE, issueCustomerSession } from '@/lib/account/session'
import { verifyInitData } from '@/lib/tg/init-data'
import { TG_MODE_COOKIE, siteIsHttps, tgCookieOptions } from '@/lib/tg/mode'
import { tgSafeNext } from '@/lib/tg/next'
import { tgSessionLimiter } from '@/lib/tg/limits'
import { isJsonContentType, isSameOrigin } from '@/lib/admin/csrf'
import { forbidden, json, rateLimited } from '../../account/_lib'

/** initData is a bearer credential readable by page JS: accept it for 1 h (the Mini App gets fresh data on every open). */
const INIT_DATA_MAX_AGE_SEC = 3600

export const dynamic = 'force-dynamic'

const toLocale = (v: unknown): Locale | null => ((locales as readonly string[]).includes(v as string) ? (v as Locale) : null)

/**
 * POST /api/tg/session { initData, next? } — Telegram Mini App launch (also re-polled while a phone is being linked).
 * Validates Telegram's signed launch data with the bot token. A Telegram user linked to an account gets that
 * account's `customer_session`; anyone else browses as a guest (any other session on this device is cleared, so a
 * second Telegram account on the same phone never sees the first one's account). Always sets `tg_mode`.
 * -> 200 { signedIn, locale, next } | 401 { error: 'BAD_INIT_DATA' } | 429.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req.headers, 'POST')) return forbidden() // login CSRF: a cross-site form must not swap the session
  if (!isJsonContentType(req.headers)) return json({ error: 'UNSUPPORTED_MEDIA_TYPE' }, 415)
  if (tgSessionLimiter.reserve(clientKey(req.headers)) === null) return rateLimited(60)
  try {
    const body = (await req.json().catch(() => null)) as { initData?: unknown; next?: unknown } | null
    const { telegramBotToken } = await getSettings()
    const tg = typeof body?.initData === 'string' && telegramBotToken ? verifyInitData(body.initData, telegramBotToken, { maxAgeSec: INIT_DATA_MAX_AGE_SEC }) : null
    if (!tg) return json({ error: 'BAD_INIT_DATA' }, 401)

    const c = await prisma.customer.findUnique({ where: { telegramUserId: tg.userId }, select: { id: true, accountLocale: true, accountCreatedAt: true } })
    const token = c?.accountCreatedAt ? await issueCustomerSession(c.id) : null
    const locale = toLocale(token ? c?.accountLocale : null) ?? toLocale(tg.languageCode) ?? 'uz'
    const next = tgSafeNext(body?.next, locale)

    const res = json({ signedIn: token !== null, locale, next })
    const opts = tgCookieOptions(siteIsHttps())
    if (token) res.cookies.set(CUSTOMER_COOKIE, token, opts)
    else res.cookies.set(CUSTOMER_COOKIE, '', { ...opts, maxAge: 0 })
    res.cookies.set(TG_MODE_COOKIE, '1', opts)
    return res
  } catch (e) {
    console.error('[tg] session failed', e)
    return json({ error: 'SERVER' }, 500)
  }
}
