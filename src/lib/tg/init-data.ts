import { createHmac, timingSafeEqual } from 'node:crypto'

// Telegram Mini App launch data (`Telegram.WebApp.initData`) validation, per
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// The data-check-string is every field except `hash`, sorted by key, as `key=value` joined by "\n";
// secret = HMAC_SHA256(key "WebAppData", bot token); hash = hex HMAC_SHA256(secret, data-check-string).

export type TgInitUser = { userId: string; firstName: string; languageCode: string | null; authDate: Date }

const MAX_FUTURE_SKEW_SEC = 60

export function verifyInitData(
  raw: string,
  botToken: string,
  opts: { now?: Date; maxAgeSec?: number } = {},
): TgInitUser | null {
  try {
    if (typeof raw !== 'string' || !raw || !botToken) return null
    const params = new URLSearchParams(raw)
    const hash = params.get('hash')
    if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null
    const pairs: [string, string][] = []
    for (const [k, v] of params) if (k !== 'hash') pairs.push([k, v])
    pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    const dataCheck = pairs.map(([k, v]) => `${k}=${v}`).join('\n')
    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
    const expected = createHmac('sha256', secret).update(dataCheck).digest()
    const given = Buffer.from(hash, 'hex')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

    const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000)
    const authSec = Number(params.get('auth_date'))
    if (!Number.isSafeInteger(authSec) || authSec <= 0) return null
    if (authSec > nowSec + MAX_FUTURE_SKEW_SEC || nowSec - authSec > (opts.maxAgeSec ?? 86400)) return null

    const user = JSON.parse(params.get('user') ?? 'null') as Record<string, unknown> | null
    if (!user || typeof user !== 'object' || typeof user.id !== 'number' || !Number.isSafeInteger(user.id) || user.id <= 0) return null
    return {
      userId: String(user.id),
      firstName: typeof user.first_name === 'string' ? user.first_name : '',
      languageCode: typeof user.language_code === 'string' ? user.language_code : null,
      authDate: new Date(authSec * 1000),
    }
  } catch {
    return null
  }
}
