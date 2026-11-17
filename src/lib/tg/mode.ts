import { cookies } from 'next/headers'

// No import from '@/lib/account/session' here: session.ts imports this module (sign-out inside the Mini App).
const SESSION_MAX_AGE = 30 * 24 * 3600 // = CUSTOMER_SESSION_MAX_AGE

/** Set by POST /api/tg/session: the storefront renders its Telegram Mini App chrome while this cookie is present. */
export const TG_MODE_COOKIE = 'tg_mode'

/**
 * Cookie options for cookies set from inside the Mini App. Telegram Web embeds the app in an iframe, where a
 * SameSite=Lax cookie is not sent: on https use SameSite=None; Secure; Partitioned (CHIPS). Plain http (local dev)
 * cannot use None, so it stays Lax.
 */
export function tgCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    path: '/',
    maxAge: SESSION_MAX_AGE,
    sameSite: secure ? ('none' as const) : ('lax' as const),
    secure,
    ...(secure ? { partitioned: true } : {}),
  }
}

export const siteIsHttps = (site: string | undefined = process.env.SITE_URL) => (site ?? '').trim().toLowerCase().startsWith('https://')

/** True inside the Telegram Mini App (server components / actions). */
export async function isTelegramMode(): Promise<boolean> {
  return (await cookies()).get(TG_MODE_COOKIE)?.value === '1'
}
