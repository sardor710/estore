import { describe, it, expect, afterEach } from 'vitest'
import { clientKey, createSharedAwareLimiter } from '@/lib/rate-limit'

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
})

const h = (o: Record<string, string>) => new Headers(o)

describe('clientKey', () => {
  it("without TRUST_PROXY=1 -> 'shared' (X-Forwarded-For is client-controlled)", () => {
    delete process.env.TRUST_PROXY
    expect(clientKey(h({ 'x-forwarded-for': '1.2.3.4' }))).toBe('shared')
  })

  it('behind a trusted proxy -> the RIGHTMOST X-Forwarded-For entry (the one the proxy appended)', () => {
    process.env.TRUST_PROXY = '1'
    expect(clientKey(h({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' }))).toBe('1.2.3.4')
    expect(clientKey(h({ 'x-forwarded-for': 'spoofed, also-spoofed ,  9.9.9.9 ' }))).toBe('9.9.9.9')
    expect(clientKey(h({ 'x-forwarded-for': '1.2.3.4' }))).toBe('1.2.3.4')
    expect(clientKey(h({ 'x-forwarded-for': '1.2.3.4, ' }))).toBe('1.2.3.4')
    expect(clientKey(h({ 'x-real-ip': '5.5.5.5' }))).toBe('5.5.5.5')
    expect(clientKey(h({}))).toBe('shared')
  })
})

describe('createSharedAwareLimiter', () => {
  it("per-key cap for real client keys, a separate larger cap for the 'shared' key", () => {
    const l = createSharedAwareLimiter({ windowMs: 1000, max: 2, sharedMax: 5 })
    expect(l.reserve('a', 0)).not.toBeNull()
    expect(l.reserve('a', 0)).not.toBeNull()
    expect(l.reserve('a', 0)).toBeNull()
    for (let i = 0; i < 5; i++) expect(l.reserve('shared', 0)).not.toBeNull()
    expect(l.reserve('shared', 0)).toBeNull()
    expect(l.reserve('b', 0)).not.toBeNull()
    expect(l.reserve('shared', 1000)).not.toBeNull()
    l.reset()
    expect(l.reserve('a', 0)).not.toBeNull()
  })
})
