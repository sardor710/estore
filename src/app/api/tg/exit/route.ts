import type { NextRequest } from 'next/server'
import { isSameOrigin } from '@/lib/admin/csrf'
import { TG_MODE_COOKIE, siteIsHttps, tgCookieOptions } from '@/lib/tg/mode'
import { forbidden, json } from '../../account/_lib'

export const dynamic = 'force-dynamic'

/**
 * POST /api/tg/exit — the page is in Telegram mode but no Telegram client is present (script failed to load, or a
 * stale `tg_mode` cookie in a normal browser / Telegram's in-app browser): drop Telegram mode so the website UI
 * (header, in-page checkout buttons, website sign-in) comes back. The session cookie is left alone.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req.headers, req.method)) return forbidden()
  const res = json({ ok: true })
  res.cookies.set(TG_MODE_COOKIE, '', { ...tgCookieOptions(siteIsHttps()), maxAge: 0 })
  return res
}
