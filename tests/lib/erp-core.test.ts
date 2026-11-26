import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { siteStock, verifyErpSignature, pendingBySku } from '@/lib/erp/core'

describe('siteStock', () => {
  it('ERP qty minus units confirmed but not yet pushed', () => {
    expect(siteStock(5, 2, 0)).toBe(3)
  })
  it('never negative', () => {
    expect(siteStock(1, 3, 0)).toBe(0)
  })
  it('adds back cancellations not yet pushed', () => {
    expect(siteStock(2, 0, 1)).toBe(3)
  })
  it('floors fractional ERP quantities', () => {
    expect(siteStock(2.9, 0, 0)).toBe(2)
  })
})

describe('verifyErpSignature', () => {
  const secret = 'whsec'
  const body = '{"type":"stock","item_code":"A1"}'
  const good = createHmac('sha256', secret).update(body).digest('base64')
  it('accepts the base64 HMAC-SHA256 of the raw body', () => {
    expect(verifyErpSignature(body, good, secret)).toBe(true)
  })
  it('rejects a wrong or missing signature', () => {
    expect(verifyErpSignature(body, 'AAAA', secret)).toBe(false)
    expect(verifyErpSignature(body, null, secret)).toBe(false)
    expect(verifyErpSignature(body + ' ', good, secret)).toBe(false)
  })
  it('rejects everything when no secret is configured', () => {
    expect(verifyErpSignature(body, good, '')).toBe(false)
  })
})

describe('pendingBySku', () => {
  it('counts undelivered DELIVER as out and RETURN/RECEIPT as back; ignores DONE', () => {
    const m = pendingBySku([
      { kind: 'DELIVER', status: 'PENDING', lines: [{ sku: 'A', qty: 2, rateUzs: 1 }] },
      { kind: 'DELIVER', status: 'FAILED', lines: [{ sku: 'A', qty: 1, rateUzs: 1 }, { sku: 'B', qty: 1, rateUzs: 1 }] },
      { kind: 'DELIVER', status: 'DONE', lines: [{ sku: 'A', qty: 9, rateUzs: 1 }] },
      { kind: 'RETURN', status: 'RUNNING', lines: [{ sku: 'B', qty: 1, rateUzs: 1 }] },
      { kind: 'RECEIPT', status: 'PENDING', lines: [{ sku: 'C', qty: 4, rateUzs: 1 }] },
    ])
    expect(m.get('A')).toEqual({ out: 3, back: 0 })
    expect(m.get('B')).toEqual({ out: 1, back: 1 })
    expect(m.get('C')).toEqual({ out: 0, back: 4 })
  })
  it('a FAILED return/receipt never adds stock (ERP may already hold it) — only a FAILED delivery keeps its deduction', () => {
    const m = pendingBySku([
      { kind: 'RETURN', status: 'FAILED', lines: [{ sku: 'A', qty: 2, rateUzs: 1 }] },
      { kind: 'RECEIPT', status: 'FAILED', lines: [{ sku: 'A', qty: 1, rateUzs: 1 }] },
      { kind: 'DELIVER', status: 'SKIPPED', lines: [{ sku: 'A', qty: 5, rateUzs: 1 }] },
    ])
    expect(m.get('A') ?? { out: 0, back: 0 }).toEqual({ out: 0, back: 0 })
  })
  it('accepts lines stored as a JSON string (SQLite JSON columns)', () => {
    const m = pendingBySku([{ kind: 'DELIVER', status: 'PENDING', lines: '[{"sku":"A","qty":2,"rateUzs":5}]' }])
    expect(m.get('A')).toEqual({ out: 2, back: 0 })
  })
})
