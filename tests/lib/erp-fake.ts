/**
 * In-memory stand-in for the ERPNext REST API, wired in through setErpFetch().
 * Supports exactly what src/lib/erp uses: resource list with equality/"in" filters, resource insert,
 * frappe.client.set_value, frappe.client.delete, upload_file. Unique zanko_order_ref like the real custom field.
 */
import { setErpFetch } from '@/lib/erp/client'

type Doc = Record<string, unknown> & { name: string }
export type FakeErp = {
  db: Map<string, Doc[]>
  calls: { method: string; path: string; body?: unknown }[]
  /** Return a Response to short-circuit a call (failure injection). */
  intercept: ((method: string, path: string, body: unknown) => Response | null) | null
  docs: (doctype: string) => Doc[]
  add: (doctype: string, doc: Record<string, unknown>) => Doc
}

let seq = 0

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function matches(doc: Doc, filters: unknown[]): boolean {
  return filters.every((f) => {
    const [field, op, value] = f as [string, string, unknown]
    if (op === '=') return doc[field] === value
    if (op === 'in') return (value as unknown[]).includes(doc[field])
    if (op === '!=') return doc[field] !== value
    throw new Error(`fake ERP: unsupported op ${op}`)
  })
}

export function installFakeErp(): FakeErp {
  process.env.ERP_URL = 'http://erp.test'
  process.env.ERP_API_KEY = 'k'
  process.env.ERP_API_SECRET = 's'
  const db = new Map<string, Doc[]>()
  const docs = (dt: string) => {
    if (!db.has(dt)) db.set(dt, [])
    return db.get(dt)!
  }
  const add = (dt: string, doc: Record<string, unknown>): Doc => {
    const name = String(doc.name ?? doc.item_code ?? doc.item_group_name ?? doc.brand ?? `${dt.replace(/\s/g, '').toUpperCase()}-${++seq}`)
    const d = { docstatus: 0, ...doc, name } as Doc
    docs(dt).push(d)
    return d
  }
  const fake: FakeErp = { db, calls: [], intercept: null, docs, add }

  setErpFetch((async (url: string, init: RequestInit) => {
    const u = new URL(url)
    const path = decodeURIComponent(u.pathname)
    const method = init.method ?? 'GET'
    let body: unknown = undefined
    if (init.body instanceof FormData) body = Object.fromEntries(init.body.entries())
    else if (typeof init.body === 'string') body = JSON.parse(init.body)
    fake.calls.push({ method, path: path + u.search, body })
    const hit = fake.intercept?.(method, path, body)
    if (hit) return hit

    const res = path.match(/^\/api\/resource\/([^/]+)$/)
    if (res && method === 'GET') {
      const filters = JSON.parse(u.searchParams.get('filters') ?? '[]') as unknown[]
      const fields = JSON.parse(u.searchParams.get('fields') ?? '["name"]') as string[]
      const rows = docs(res[1])
        .filter((d) => matches(d, filters))
        .map((d) => (fields.includes('*') ? d : Object.fromEntries(fields.map((f) => [f, d[f] ?? null]))))
      const start = Number(u.searchParams.get('limit_start') ?? 0)
      const len = Number(u.searchParams.get('limit_page_length') ?? 20)
      return json(200, { data: len === 0 ? rows.slice(start) : rows.slice(start, start + len) })
    }
    if (res && method === 'POST') {
      const b = body as Record<string, unknown>
      if (b.zanko_order_ref && docs(res[1]).some((d) => d.zanko_order_ref === b.zanko_order_ref)) {
        return json(409, { exc_type: 'UniqueValidationError', exception: `Duplicate entry '${b.zanko_order_ref}'` })
      }
      return json(200, { data: add(res[1], b) })
    }
    if (path === '/api/method/frappe.client.set_value' && method === 'POST') {
      const b = body as { doctype: string; name: string; fieldname: Record<string, unknown> }
      const d = docs(b.doctype).find((x) => x.name === b.name)
      if (!d) return json(404, { exc_type: 'DoesNotExistError' })
      Object.assign(d, b.fieldname)
      return json(200, { message: d })
    }
    if (path === '/api/method/upload_file' && method === 'POST') {
      const b = body as Record<string, unknown>
      const f = b.file as File
      const d = add('File', { file_name: f.name, file_url: `/files/${f.name}`, attached_to_doctype: b.doctype, attached_to_name: b.docname })
      return json(200, { message: d })
    }
    return json(404, { exc_type: 'DoesNotExistError', exception: `fake ERP: no route ${method} ${path}` })
  }) as unknown as typeof fetch)
  return fake
}
