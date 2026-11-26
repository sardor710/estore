/**
 * Octo (octo.uz) payment API client — hosted payment page, one-stage (auto_capture) payments in UZS.
 * Docs: https://help.octo.uz/en/ . Credentials travel in the JSON body; this module is server-only.
 */
const API = 'https://secure.octo.uz'

export type OctoConfig = { shopId: number; secret: string; test: boolean }

/** Octo credentials from env (OCTO_SHOP_ID, OCTO_SECRET, OCTO_TEST=1 for test mode), or null when not configured. */
export function octoConfig(): OctoConfig | null {
  const shopId = Number((process.env.OCTO_SHOP_ID ?? '').trim())
  const secret = (process.env.OCTO_SECRET ?? '').trim()
  if (!Number.isInteger(shopId) || shopId <= 0 || !secret) return null
  return { shopId, secret, test: (process.env.OCTO_TEST ?? '').trim() === '1' }
}

export class OctoError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.name = 'OctoError'
    this.code = code
  }
}

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN)

function requireConfig(): OctoConfig {
  const c = octoConfig()
  if (!c) throw new OctoError(-1, 'Octo is not configured (OCTO_SHOP_ID / OCTO_SECRET)')
  return c
}

/** POST to Octo; returns the merged response fields (data first, top level as fallback) or throws OctoError. */
async function call(path: string, body: Json, f: typeof fetch): Promise<Json> {
  let res: Response
  try {
    res = await f(`${API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    throw new OctoError(-2, `Network error: ${e instanceof Error ? e.message : String(e)}`)
  }
  const json = (await res.json().catch(() => null)) as unknown
  if (!isObj(json)) throw new OctoError(-3, `Bad response from Octo (HTTP ${res.status})`)
  const code = num(json.error)
  if (code !== 0) throw new OctoError(Number.isFinite(code) ? code : -3, str(json.errMessage) ?? str(json.errorMessage) ?? `Octo error ${String(json.error)}`)
  return { ...json, ...(isObj(json.data) ? json.data : {}) }
}

/** "yyyy-MM-dd HH:mm:ss" in Tashkent time (UTC+5, no DST). */
function tashkentNow(): string {
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 19).replace('T', ' ')
}

export type PrepareInput = {
  shopTransactionId: string
  amountUzs: number
  description: string
  returnUrl: string
  notifyUrl: string
  language: 'uz' | 'ru' | 'en'
  phone?: string
}

/** Create a payment; the customer is sent to `payUrl` (Octo's hosted page). */
export async function octoPrepare(input: PrepareInput, f: typeof fetch = fetch): Promise<{ uuid: string; payUrl: string; status: string }> {
  const c = requireConfig()
  const d = await call(
    '/prepare_payment',
    {
      octo_shop_id: c.shopId,
      octo_secret: c.secret,
      shop_transaction_id: input.shopTransactionId,
      auto_capture: true,
      test: c.test,
      init_time: tashkentNow(),
      total_sum: input.amountUzs,
      currency: 'UZS',
      description: input.description,
      return_url: input.returnUrl,
      notify_url: input.notifyUrl,
      language: input.language,
      ttl: 30,
    },
    f,
  )
  const uuid = str(d.octo_payment_UUID)
  const payUrl = str(d.octo_pay_url)
  if (!uuid || !payUrl) throw new OctoError(-3, 'Octo did not return a payment link')
  return { uuid, payUrl, status: str(d.status) ?? 'created' }
}

export type OctoStatus = { uuid: string; status: string; totalSum: number; maskedPan?: string; cardVendor?: string; payedTime?: string }

/** Current status of a payment, asked by our shop_transaction_id (the authoritative check). */
export async function octoStatus(shopTransactionId: string, f: typeof fetch = fetch): Promise<OctoStatus> {
  const c = requireConfig()
  const d = await call('/prepare_payment', { octo_shop_id: c.shopId, octo_secret: c.secret, shop_transaction_id: shopTransactionId }, f)
  const out: OctoStatus = { uuid: str(d.octo_payment_UUID) ?? '', status: str(d.status) ?? 'unknown', totalSum: num(d.total_sum) }
  const pan = str(d.maskedPan)
  const vendor = str(d.card_vendor)
  const paid = str(d.payed_time)
  if (pan) out.maskedPan = pan
  if (vendor) out.cardVendor = vendor
  if (paid) out.payedTime = paid
  return out
}

/** Full or partial refund of a succeeded payment. */
export async function octoRefund(
  input: { uuid: string; refundId: string; amountUzs: number },
  f: typeof fetch = fetch,
): Promise<{ refundId: string; status: 'succeeded' | 'pending' | 'failed' }> {
  const c = requireConfig()
  const d = await call(
    '/refund',
    { octo_shop_id: c.shopId, octo_secret: c.secret, shop_refund_id: input.refundId, octo_payment_UUID: input.uuid, amount: input.amountUzs },
    f,
  )
  const s = str(d.status)
  return { refundId: str(d.refund_id) ?? input.refundId, status: s === 'succeeded' || s === 'pending' ? s : 'failed' }
}
