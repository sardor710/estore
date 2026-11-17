import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAnkerHtml } from '@/lib/importer/anker-parse'
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

describe('sanitizeHtml rich content', () => {
  it('strips onerror and non-https/non-uploads src from img', () => {
    const out = sanitizeHtml('<img src=x onerror=alert(1)>')
    expect(out).not.toMatch(/onerror/i)
    expect(out).not.toContain('src="x"')
    expect(sanitizeHtml('<img src="/uploads/2026/11/a.png" alt="a" width="10" height="5">')).toContain('src="/uploads/2026/11/a.png"')
    expect(sanitizeHtml('<img src="//evil.test/a.png">')).not.toContain('img')
    expect(sanitizeHtml('<img src="/other/a.png">')).not.toContain('img')
  })
  it('removes script and foreign iframes, keeps YouTube embeds', () => {
    expect(sanitizeHtml('<p>a</p><script>alert(1)</script>')).toBe('<p>a</p>')
    expect(sanitizeHtml('<iframe src="https://evil.com/embed/x"></iframe>')).not.toContain('iframe')
    expect(sanitizeHtml('<iframe src="https://www.youtube.com.evil.com/embed/x"></iframe>')).not.toContain('iframe')
    const yt = sanitizeHtml('<iframe src="https://www.youtube.com/embed/abc123" onload="x()" srcdoc="x"></iframe>')
    expect(yt).toContain('src="https://www.youtube.com/embed/abc123"')
    expect(yt).not.toMatch(/onload|srcdoc/)
    expect(sanitizeHtml('<iframe src="https://www.youtube-nocookie.com/embed/abc"></iframe>')).toContain('youtube-nocookie.com/embed/abc')
  })
  it('keeps figures, captions, tables and whitelisted classes only', () => {
    const html =
      '<figure class="image image-style-side evil"><img src="https://x.test/a.png"><figcaption>c</figcaption></figure>' +
      '<p class="text-align-center bad">t</p><figure class="table"><table><tbody><tr><td>1</td></tr></tbody></table></figure>'
    const out = sanitizeHtml(html)
    expect(out).toContain('<figure class="image image-style-side">')
    expect(out).toContain('<figcaption>c</figcaption>')
    expect(out).toContain('<p class="text-align-center">')
    expect(out).toContain('<figure class="table">')
    expect(out).not.toMatch(/evil|bad/)
  })
  it('keeps media oembed wrapper', () => {
    const out = sanitizeHtml('<figure class="media"><div data-oembed-url="x"><iframe src="https://www.youtube.com/embed/abc"></iframe></div></figure>')
    expect(out).toContain('<figure class="media">')
    expect(out).toContain('youtube.com/embed/abc')
  })
  it('is idempotent on the Anker fixture description', () => {
    const html = readFileSync(join(__dirname, '..', 'fixtures', 'anker-a120f.html'), 'utf8')
    const d = parseAnkerHtml(html, 'https://www.anker.com/products/a120f-100w-usb-c-gan-charger-battery-care').descriptionHtml
    const once = sanitizeHtml(d)
    expect(once.length).toBeGreaterThan(0)
    expect(sanitizeHtml(once)).toBe(once)
  })
})

describe('sanitizeHtml on real CKEditor output', () => {
  it('keeps uploaded image figures and YouTube previews, drops inline styles', () => {
    const img = '<figure class="image"><img style="aspect-ratio:1/1;" src="/uploads/2026/11/73da.png" width="1" height="1"></figure>'
    expect(sanitizeHtml(img)).toBe('<figure class="image"><img src="/uploads/2026/11/73da.png" width="1" height="1" /></figure>')
    const yt =
      '<figure class="media"><div data-oembed-url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"><div><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="1280" height="720" style="width: 100%;" frameborder="0" allow="autoplay" allowfullscreen=""></iframe></div></div></figure>'
    const out = sanitizeHtml(yt)
    expect(out).toContain('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"')
    expect(out).not.toMatch(/style|frameborder|data-oembed|allow="/)
    expect(sanitizeHtml(out)).toBe(out)
  })
})
