import { describe, it, expect } from 'vitest'
import { config } from '@/middleware'

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
