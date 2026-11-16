import { describe, it, expect } from 'vitest'
import { config } from '@/proxy'

// Next anchors matcher patterns like this (path-to-regexp semantics reduce to ^...$ here).
const re = new RegExp(`^${config.matcher[0]}$`)

describe('middleware matcher', () => {
  it.each(['/', '/uz', '/ru/products', '/products', '/en/cart'])('matches %s', (p) => {
    expect(re.test(p)).toBe(true)
  })
  it.each(['/_next/x', '/a.png', '/api/x', '/admin', '/favicon.ico'])('skips %s', (p) => {
    expect(re.test(p)).toBe(false)
  })
})

describe('middleware matcher: admin guard entries', () => {
  const rest = config.matcher.slice(1)
  it('lists the admin guard patterns', () => {
    expect(rest).toEqual(['/admin/:path*', '/api/admin/:path*'])
  })
  it('public pattern never matches admin or api paths (guard is a separate entry)', () => {
    for (const p of ['/admin', '/admin/products', '/api/admin/orders']) expect(re.test(p)).toBe(false)
  })
})
