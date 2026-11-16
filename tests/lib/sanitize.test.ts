import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '@/lib/sanitize'

const BAD = /onload|onerror|javascript:|<svg|<base|<script|<math/i

describe('sanitizeHtml', () => {
  const attacks = [
    '<svg/onload=alert(1)>',
    '<img/src=x/onerror=alert(1)>',
    '<img src=x onerror=alert(1)>',
    '<a href="&#106;avascript:alert(1)">x</a>',
    '<a href="java&#9;script:alert(1)">x</a>',
    '<a href=javascript:alert(1)>x</a>',
    '<base href="javascript:alert(1)//">',
    '<math><mi//xlink:href="data:x,<script>alert(1)</script>">',
    '<script>alert(1)</script>',
    '<img src="javascript:alert(1)">',
  ]
  for (const a of attacks) {
    it(`neutralises ${a}`, () => {
      expect(sanitizeHtml(a)).not.toMatch(BAD)
    })
  }
  it('keeps allowed markup', () => {
    expect(sanitizeHtml('<p><strong>x</strong></p>')).toBe('<p><strong>x</strong></p>')
  })
  it('keeps https links and adds rel', () => {
    const out = sanitizeHtml('<a href="https://example.com/a">go</a>')
    expect(out).toContain('href="https://example.com/a"')
    expect(out).toContain('rel="noopener noreferrer"')
  })
  it('keeps https images, drops data: images', () => {
    expect(sanitizeHtml('<img src="https://x.test/a.png" alt="a">')).toContain('src="https://x.test/a.png"')
    expect(sanitizeHtml('<img src="data:image/png;base64,AAAA">')).not.toContain('data:')
  })
})
