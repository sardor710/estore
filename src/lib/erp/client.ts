/**
 * Thin ERPNext (Frappe) REST client. The store talks to the ERP over the server's loopback
 * (ERP_URL=http://127.0.0.1:8088) with token auth; no public hop.
 *
 * Errors are ErpError with `transient` = worth retrying (network, timeout, 5xx, 429)
 * or not (validation, not found, permission) — the outbox decides retry vs. FAILED on it.
 */

export type ErpConfig = { url: string; host: string | null; key: string; secret: string }

export function erpConfig(): ErpConfig | null {
  const url = process.env.ERP_URL?.trim()
  const key = process.env.ERP_API_KEY?.trim()
  const secret = process.env.ERP_API_SECRET?.trim()
  if (!url || !key || !secret) return null
  return { url: url.replace(/\/+$/, ''), host: process.env.ERP_HOST?.trim() || null, key, secret }
}

/** ERP sync is on only when the flag is set and the ERP is configured. */
export function erpEnabled(): boolean {
  return process.env.ERP_ENABLED === '1' && erpConfig() !== null
}

export class ErpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly transient: boolean,
    readonly excType: string | null = null,
  ) {
    super(message)
    this.name = 'ErpError'
  }
}

let fetchImpl: typeof fetch | null = null
/** Tests swap the transport; null restores global fetch. */
export function setErpFetch(f: typeof fetch | null): void {
  fetchImpl = f
}

const TIMEOUT_MS = 15_000

function encodePath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(decodeURIComponent(seg)))
    .join('/')
}

/** Best human-readable message from a Frappe error body. */
function frappeMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    if (typeof b._server_messages === 'string') {
      try {
        const msgs = (JSON.parse(b._server_messages) as string[]).map((m) => {
          try {
            return String((JSON.parse(m) as { message?: unknown }).message ?? m)
          } catch {
            return m
          }
        })
        const text = msgs.join(' | ').replace(/<[^>]+>/g, '').trim()
        if (text) return text
      } catch {
        /* fall through */
      }
    }
    if (typeof b.exception === 'string' && b.exception) return b.exception
    if (typeof b.message === 'string' && b.message) return b.message
    if (typeof b.exc_type === 'string') return b.exc_type
  }
  return fallback
}

async function send(path: string, init: RequestInit): Promise<unknown> {
  const cfg = erpConfig()
  if (!cfg) throw new ErpError('ERP is not configured', 0, false)
  const headers = new Headers(init.headers)
  headers.set('Authorization', `token ${cfg.key}:${cfg.secret}`)
  headers.set('Accept', 'application/json')
  if (cfg.host) headers.set('Host', cfg.host)
  const f = fetchImpl ?? fetch
  let res: Response
  try {
    res = await f(cfg.url + path, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    throw new ErpError(`ERP unreachable: ${(e as Error).message}`, 0, true)
  }
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    const transient = res.status >= 500 || res.status === 429
    const excType = body && typeof body === 'object' ? ((body as Record<string, unknown>).exc_type as string) ?? null : null
    throw new ErpError(frappeMessage(body, `ERP HTTP ${res.status}`), res.status, transient, excType)
  }
  return body
}

export async function erpRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  opts: { query?: Record<string, string | number>; body?: unknown } = {},
): Promise<T> {
  let url = encodePath(path)
  if (opts.query) {
    const qs = new URLSearchParams(Object.entries(opts.query).map(([k, v]) => [k, String(v)]))
    url += `?${qs}`
  }
  const init: RequestInit = { method }
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  const body = (await send(url, init)) as Record<string, unknown> | null
  if (body && typeof body === 'object') {
    if ('data' in body) return body.data as T
    if ('message' in body) return body.message as T
  }
  return body as T
}

/** Uploads a public file and attaches it to a document; returns its file_url. */
export async function erpUploadFile(
  data: Buffer | Uint8Array,
  filename: string,
  attach: { doctype: string; docname: string; isPrivate?: 0 | 1 },
): Promise<string> {
  const form = new FormData()
  form.set('file', new File([new Uint8Array(data)], filename))
  form.set('doctype', attach.doctype)
  form.set('docname', attach.docname)
  form.set('is_private', String(attach.isPrivate ?? 0))
  const body = (await send('/api/method/upload_file', { method: 'POST', body: form })) as { message?: { file_url?: string } }
  const url = body?.message?.file_url
  if (!url) throw new ErpError('upload_file returned no file_url', 200, false)
  return url
}

type Filter = [string, '=' | '!=' | 'in', unknown]

/**
 * Lists documents by filters (never by name in the URL path: some SKUs contain "/").
 * pageLength 0 = all rows.
 */
export async function erpList<T = Record<string, unknown>>(
  doctype: string,
  filters: Filter[],
  fields: string[] = ['name'],
  pageLength = 0,
): Promise<T[]> {
  return erpRequest<T[]>('GET', `/api/resource/${doctype}`, {
    query: { filters: JSON.stringify(filters), fields: JSON.stringify(fields), limit_page_length: pageLength },
  })
}

export async function erpInsert<T = Record<string, unknown> & { name: string }>(doctype: string, doc: Record<string, unknown>): Promise<T> {
  return erpRequest<T>('POST', `/api/resource/${doctype}`, { body: doc })
}

export async function erpSetValue(doctype: string, name: string, values: Record<string, unknown>): Promise<void> {
  await erpRequest('POST', '/api/method/frappe.client.set_value', { body: { doctype, name, fieldname: values } })
}
