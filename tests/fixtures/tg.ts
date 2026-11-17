import { createHmac } from 'node:crypto'

/**
 * Builds a Telegram Mini App `initData` string signed exactly like Telegram does (test-only).
 * `fields.user` may be an object (JSON-encoded here) or a raw string.
 */
export function signInitData(fields: Record<string, unknown>, botToken: string): string {
  const entries = Object.entries(fields).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)] as [string, string])
  const dataCheck = [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = createHmac('sha256', secret).update(dataCheck).digest('hex')
  const params = new URLSearchParams(entries)
  params.set('hash', hash)
  return params.toString()
}

export const nowSec = (d = new Date()) => Math.floor(d.getTime() / 1000)

/** Typical launch payload for a Telegram user. */
export function tgUser(id: number, o: { languageCode?: string; firstName?: string; authDate?: number } = {}) {
  return {
    query_id: 'AAH-test',
    user: { id, first_name: o.firstName ?? 'Aziz', language_code: o.languageCode ?? 'uz' },
    auth_date: String(o.authDate ?? nowSec()),
  }
}
