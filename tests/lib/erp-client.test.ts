import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { erpRequest, erpUploadFile, erpConfig, ErpError, setErpFetch } from '@/lib/erp/client'

const saved = { ...process.env }
beforeEach(() => {
  process.env.ERP_URL = 'http://127.0.0.1:8088'
  process.env.ERP_HOST = 'erp2.zanko.uz'
  process.env.ERP_API_KEY = 'k1'
  process.env.ERP_API_SECRET = 's1'
})
afterEach(() => {
  process.env = { ...saved }
  setErpFetch(null)
})

type Seen = { url: string; init: RequestInit }
function respond(status: number, body: unknown, seen: Seen[] = []) {
  setErpFetch((async (url: string, init: RequestInit) => {
    seen.push({ url, init })
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch)
  return seen
}

describe('erpConfig', () => {
  it('is null unless url, key and secret are set', () => {
    expect(erpConfig()).toMatchObject({ url: 'http://127.0.0.1:8088', host: 'erp2.zanko.uz' })
    delete process.env.ERP_API_SECRET
    expect(erpConfig()).toBeNull()
  })
})

describe('erpRequest', () => {
  it('sends token auth and the site Host header, returns the data field', async () => {
    const seen = respond(200, { data: { name: 'SKU-1' } })
    const r = await erpRequest<{ name: string }>('GET', '/api/resource/Item/SKU-1', { query: { fields: '["name"]' } })
    expect(r).toEqual({ name: 'SKU-1' })
    expect(seen[0].url).toBe('http://127.0.0.1:8088/api/resource/Item/SKU-1?fields=%5B%22name%22%5D')
    const h = new Headers(seen[0].init.headers)
    expect(h.get('authorization')).toBe('token k1:s1')
    expect(h.get('host')).toBe('erp2.zanko.uz')
  })

  it('returns the message field for /api/method calls', async () => {
    respond(200, { message: 'pong' })
    expect(await erpRequest('GET', '/api/method/ping')).toBe('pong')
  })

  it('sends JSON bodies', async () => {
    const seen = respond(200, { data: { name: 'DN-1' } })
    await erpRequest('POST', '/api/resource/Delivery Note', { body: { customer: 'X' } })
    expect(seen[0].init.method).toBe('POST')
    expect(JSON.parse(String(seen[0].init.body))).toEqual({ customer: 'X' })
    expect(seen[0].url).toBe('http://127.0.0.1:8088/api/resource/Delivery%20Note')
  })

  it('5xx is transient', async () => {
    respond(502, 'Bad gateway')
    const e = await erpRequest('GET', '/api/method/ping').catch((x: ErpError) => x)
    expect(e).toBeInstanceOf(ErpError)
    expect(e.transient).toBe(true)
    expect(e.status).toBe(502)
  })

  it('429 is transient', async () => {
    respond(429, {})
    expect((await erpRequest('GET', '/api/method/ping').catch((x: ErpError) => x)).transient).toBe(true)
  })

  it('a network failure is transient', async () => {
    setErpFetch((async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch)
    const e = await erpRequest('GET', '/api/method/ping').catch((x: ErpError) => x)
    expect(e).toBeInstanceOf(ErpError)
    expect(e.transient).toBe(true)
  })

  it('a validation error is permanent and carries the Frappe message', async () => {
    respond(417, {
      exc_type: 'NegativeStockError',
      _server_messages: JSON.stringify([JSON.stringify({ message: '1 units of SKU-1 needed in Stores - Z' })]),
    })
    const e = await erpRequest('POST', '/api/resource/Delivery Note', { body: {} }).catch((x: ErpError) => x)
    expect(e.transient).toBe(false)
    expect(e.status).toBe(417)
    expect(e.message).toContain('1 units of SKU-1 needed')
    expect(e.excType).toBe('NegativeStockError')
  })

  it('404 is permanent', async () => {
    respond(404, { exc_type: 'DoesNotExistError' })
    const e = await erpRequest('GET', '/api/resource/Item/NOPE').catch((x: ErpError) => x)
    expect(e.transient).toBe(false)
    expect(e.status).toBe(404)
  })

  it('throws a permanent ErpError when not configured', async () => {
    delete process.env.ERP_API_KEY
    const e = await erpRequest('GET', '/api/method/ping').catch((x: ErpError) => x)
    expect(e).toBeInstanceOf(ErpError)
    expect(e.transient).toBe(false)
  })
})

describe('erpUploadFile', () => {
  it('posts multipart to upload_file and returns the file_url', async () => {
    const seen = respond(200, { message: { file_url: '/files/a.png', name: 'f1' } })
    const url = await erpUploadFile(Buffer.from('png'), 'a.png', { doctype: 'Item', docname: 'SKU-1' })
    expect(url).toBe('/files/a.png')
    expect(seen[0].url).toBe('http://127.0.0.1:8088/api/method/upload_file')
    const form = seen[0].init.body as FormData
    expect(form.get('doctype')).toBe('Item')
    expect(form.get('docname')).toBe('SKU-1')
    expect(form.get('is_private')).toBe('0')
    expect((form.get('file') as File).name).toBe('a.png')
  })
})
