// Smoke tests against a running server: node scripts/smoke.mjs http://localhost:3000
import http from 'node:http'
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
let failed = 0

async function get(path) {
  const res = await fetch(base + path, { redirect: 'manual' })
  const body = res.status < 300 || res.status >= 400 ? await res.text() : ''
  return { status: res.status, location: res.headers.get('location') || '', body }
}

// fetch() normalizes `..` segments, so path-traversal probes go out as literal request paths.
function rawGet(path) {
  return new Promise((resolve, reject) => {
    const u = new URL(base)
    const req = http.request({ host: u.hostname, port: u.port || 80, path, method: 'GET' }, (res) => {
      res.resume()
      res.on('end', () => resolve({ status: res.statusCode }))
    })
    req.on('error', reject)
    req.end()
  })
}

function report(name, ok, detail = '') {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : detail ? `  (${detail})` : ''}`)
}

async function check(name, path, fn) {
  try {
    const r = await get(path)
    const err = fn(r)
    report(name, !err, err || '')
  } catch (e) {
    report(name, false, e.message)
  }
}

const isRedirectTo = (suffix) => (r) =>
  r.status !== 307 ? `status ${r.status}` : r.location.endsWith(suffix) ? '' : `location ${r.location}`

await check('/ redirects to /uz', '/', isRedirectTo('/uz'))
await check('/products redirects to /uz/products', '/products', isRedirectTo('/uz/products'))

for (const lang of ['uz', 'ru', 'en']) {
  await check(`/${lang} is 200 with lang and hreflang`, `/${lang}`, (r) => {
    if (r.status !== 200) return `status ${r.status}`
    if (!r.body.includes(`<html lang="${lang}"`)) return 'missing html lang'
    for (const l of ['uz', 'ru', 'en', 'x-default']) {
      if (!new RegExp(`hreflang="${l}"`, 'i').test(r.body)) return `missing hreflang ${l}`
    }
    return ''
  })
}

await check('/sitemap.xml has /ru/', '/sitemap.xml', (r) =>
  r.status !== 200 ? `status ${r.status}` : r.body.includes('/ru/') ? '' : 'no /ru/ URLs')

await check('/robots.txt disallows admin and api', '/robots.txt', (r) =>
  r.status !== 200 ? `status ${r.status}`
    : r.body.includes('Disallow: /admin') && r.body.includes('Disallow: /api') ? '' : 'missing Disallow rules')

await check('/admin redirects to /admin/login', '/admin', (r) =>
  r.status < 300 || r.status >= 400 ? `status ${r.status}`
    : r.location.includes('/admin/login') ? '' : `location ${r.location}`)

await check('/api/admin/orders is 401', '/api/admin/orders', (r) =>
  r.status === 401 ? '' : `status ${r.status}`)

await check('/uz/checkout is 200 and noindex', '/uz/checkout', (r) =>
  r.status !== 200 ? `status ${r.status}` : r.body.includes('noindex') ? '' : 'no noindex')

await check('/uz/blog is 200', '/uz/blog', (r) => (r.status === 200 ? '' : `status ${r.status}`))

await check('/sitemap.xml has /blog', '/sitemap.xml', (r) =>
  r.status !== 200 ? `status ${r.status}` : r.body.includes('/blog') ? '' : 'no /blog URLs')

try {
  const res = await fetch(base + '/api/track', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    },
    body: JSON.stringify({ path: '/uz', locale: 'uz', referrer: '' }),
  })
  report('POST /api/track is 204', res.status === 204, `status ${res.status}`)
} catch (e) {
  report('POST /api/track is 204', false, e.message)
}

try {
  const res = await fetch(base + '/api/admin/uploads', { method: 'POST' })
  report('unauthenticated POST /api/admin/uploads is 401', res.status === 401, `status ${res.status}`)
} catch (e) {
  report('unauthenticated POST /api/admin/uploads is 401', false, e.message)
}

for (const path of ['/uploads/../.env', '/uploads/%2e%2e/.env']) {
  try {
    const r = await rawGet(path)
    report(`GET ${path} is 404`, r.status === 404, `status ${r.status}`)
  } catch (e) {
    report(`GET ${path} is 404`, false, e.message)
  }
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed')
process.exit(failed ? 1 : 0)
