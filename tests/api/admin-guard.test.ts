import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import middleware from '@/proxy'
import { createSession, SESSION_COOKIE } from '@/lib/auth'
import { adminApi } from '@/lib/admin/api'
import { GET as ordersGET } from '@/app/api/admin/orders/route'
import { POST as statusPOST } from '@/app/api/admin/orders/[id]/status/route'
import { prisma } from '@/lib/db'
import type { Role } from '@/lib/permissions'

const saved = { ...process.env }
beforeEach(() => {
  process.env.ADMIN_USER = 'owner'
  process.env.ADMIN_PASSWORD = 'correct horse battery'
  process.env.SESSION_SECRET = 'z'.repeat(40)
  process.env.SITE_URL = 'http://localhost:3000'
})
afterEach(() => {
  process.env = { ...saved }
})

const url = (p: string) => `http://localhost:3000${p}`
let seq = 0
async function staffCookie(role: Role, opts: { active?: boolean } = {}) {
  const u = await prisma.adminUser.create({
    data: { email: `${role.toLowerCase()}-${++seq}@shop.uz`, name: role, role, active: opts.active ?? true, passwordHash: 'x' },
  })
  return { user: u, cookie: `${SESSION_COOKIE}=${await createSession({ uid: u.id, role, sv: u.sessionVersion })}` }
}
async function cookie() {
  return (await staffCookie('ADMIN')).cookie
}
const req = (p: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(url(p), { method: init.method ?? 'GET', headers: init.headers })
const passes = (res: Response) => res.headers.get('x-middleware-next') === '1'

describe('middleware guard', () => {
  it('/api/admin/* without cookie -> 401 JSON', async () => {
    const res = await middleware(req('/api/admin/orders'))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })
  it('/api/admin/* with garbage cookie -> 401', async () => {
    const res = await middleware(req('/api/admin/orders', { headers: { cookie: `${SESSION_COOKIE}=nope` } }))
    expect(res.status).toBe(401)
  })
  it('/api/admin/* with valid cookie passes through', async () => {
    expect(passes(await middleware(req('/api/admin/orders', { headers: { cookie: await cookie() } })))).toBe(true)
  })
  it('/admin without cookie redirects to /admin/login; login page and login API are open', async () => {
    const res = await middleware(req('/admin/products'))
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/admin/login')
    expect(passes(res)).toBe(false)
    expect(passes(await middleware(req('/admin/login')))).toBe(true)
    expect(passes(await middleware(req('/api/admin/login', { method: 'POST' })))).toBe(true)
  })
  it('/admin with valid cookie passes', async () => {
    expect(passes(await middleware(req('/admin', { headers: { cookie: await cookie() } })))).toBe(true)
  })
  it('public routes still go through next-intl', async () => {
    const res = await middleware(req('/products'))
    expect(res.headers.get('location')).toContain('/uz/products')
  })
})

describe('adminApi permissions (DB role and status are the authority)', () => {
  const ok = () => new Response('ok')
  it('BLOG_EDITOR session -> 403 on an orders handler, which is never called', async () => {
    const h = vi.fn(ok)
    const { cookie: c } = await staffCookie('BLOG_EDITOR')
    const res = await adminApi('orders', h)(req('/api/admin/orders', { headers: { cookie: c } }), {})
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
    expect(h).not.toHaveBeenCalled()
  })
  it('PRODUCT_MANAGER -> orders 200, users 403; an any-of list passes on one match', async () => {
    const { cookie: c, user } = await staffCookie('PRODUCT_MANAGER')
    const h = vi.fn((..._args: unknown[]) => ok())
    expect((await adminApi('orders', h)(req('/api/admin/orders', { headers: { cookie: c } }), {})).status).toBe(200)
    expect(h.mock.calls[0][2]).toMatchObject({ id: user.id, role: 'PRODUCT_MANAGER' })
    expect((await adminApi('users', ok)(req('/api/admin/x', { headers: { cookie: c } }), {})).status).toBe(403)
    expect((await adminApi(['users', 'catalog'], ok)(req('/api/admin/x', { headers: { cookie: c } }), {})).status).toBe(200)
  })
  it('disabled user -> 401 even with a valid token', async () => {
    const h = vi.fn(ok)
    const { cookie: c } = await staffCookie('ADMIN', { active: false })
    expect((await adminApi('orders', h)(req('/api/admin/orders', { headers: { cookie: c } }), {})).status).toBe(401)
    expect(h).not.toHaveBeenCalled()
  })
  it('role demotion applies on the next request; bumped sessionVersion (password reset) -> 401', async () => {
    const { cookie: c, user } = await staffCookie('ADMIN')
    expect((await adminApi('users', ok)(req('/api/admin/x', { headers: { cookie: c } }), {})).status).toBe(200)
    await prisma.adminUser.update({ where: { id: user.id }, data: { role: 'BLOG_EDITOR' } })
    expect((await adminApi('users', ok)(req('/api/admin/x', { headers: { cookie: c } }), {})).status).toBe(403)
    await prisma.adminUser.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } })
    expect((await adminApi('blog', ok)(req('/api/admin/x', { headers: { cookie: c } }), {})).status).toBe(401)
  })
  it('deleted user -> 401', async () => {
    const { cookie: c, user } = await staffCookie('ADMIN')
    await prisma.adminUser.delete({ where: { id: user.id } })
    expect((await adminApi('orders', ok)(req('/api/admin/orders', { headers: { cookie: c } }), {})).status).toBe(401)
  })
})

describe('route handlers re-verify the session', () => {
  it('blog editor cannot list or change orders', async () => {
    const { cookie: c } = await staffCookie('BLOG_EDITOR')
    expect((await ordersGET(req('/api/admin/orders', { headers: { cookie: c } }), {})).status).toBe(403)
    const res = await statusPOST(
      req('/api/admin/orders/1/status', { method: 'POST', headers: { cookie: c, origin: 'http://localhost:3000', host: 'localhost:3000' } }),
      { params: Promise.resolve({ id: '1' }) },
    )
    expect(res.status).toBe(403)
  })
  it('GET /api/admin/orders: 401 without cookie, 200 with', async () => {
    expect((await ordersGET(req('/api/admin/orders'), {})).status).toBe(401)
    const ok = await ordersGET(req('/api/admin/orders', { headers: { cookie: await cookie() } }), {})
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ orders: [] })
  })
  it('cross-origin POST -> 403 even with a valid cookie', async () => {
    const res = await statusPOST(
      req('/api/admin/orders/1/status', {
        method: 'POST',
        headers: { cookie: await cookie(), origin: 'https://evil.example', host: 'localhost:3000', 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '1' }) },
    )
    expect(res.status).toBe(403)
  })
  it('cross-site Sec-Fetch-Site without Origin -> 403', async () => {
    const res = await statusPOST(
      req('/api/admin/orders/1/status', { method: 'POST', headers: { cookie: await cookie(), 'sec-fetch-site': 'cross-site' } }),
      { params: Promise.resolve({ id: '1' }) },
    )
    expect(res.status).toBe(403)
  })
  it('same-origin POST without cookie -> 401', async () => {
    const res = await statusPOST(
      req('/api/admin/orders/1/status', { method: 'POST', headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } }),
      { params: Promise.resolve({ id: '1' }) },
    )
    expect(res.status).toBe(401)
  })
  it('same-origin authed POST changes status through setOrderStatus', async () => {
    const cat = await prisma.category.create({ data: { slug: 'c', name: { en: 'c' } } })
    const p = await prisma.product.create({
      data: {
        slug: 'p', categoryId: cat.id, title: {}, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [],
        inTheBox: [], faq: [], specs: [], images: [], reviewed: {},
        variants: { create: [{ sku: 'S1', name: {}, priceUzs: 10, stock: 5 }] },
      },
      include: { variants: true },
    })
    const o = await prisma.order.create({
      data: {
        number: 1001, name: 'a', phone: '+998901234567', region: 'r', address: 'x', locale: 'uz', totalUzs: 10,
        lines: { create: [{ variantId: p.variants[0].id, sku: 'S1', productTitle: 't', variantName: 'v', priceUzs: 10, qty: 2 }] },
      },
    })
    const mk = async (to: string) =>
      statusPOST(
        new NextRequest(url(`/api/admin/orders/${o.id}/status`), {
          method: 'POST',
          headers: { cookie: await cookie(), origin: 'http://localhost:3000', host: 'localhost:3000', 'content-type': 'application/json' },
          body: JSON.stringify({ to }),
        }),
        { params: Promise.resolve({ id: String(o.id) }) },
      )
    expect((await mk('CONFIRMED')).status).toBe(200)
    expect((await prisma.variant.findFirstOrThrow()).stock).toBe(3)
    expect(await prisma.activityLog.findFirst({ where: { entity: 'order', action: 'status' } })).toMatchObject({ entityId: String(o.id) })
    const bad = await mk('NEW')
    expect(bad.status).toBe(409)
    expect(await bad.json()).toMatchObject({ error: 'BAD_TRANSITION' })
  })
})
