import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { POST } from '@/app/api/track/route'
import { resetTrackThrottle } from '@/lib/analytics/track-throttle'
import { CUSTOMER_COOKIE, createCustomerSession } from '@/lib/account/session'
import { LAST_SEEN_STEP_MS } from '@/lib/account/activity'

const saved = { ...process.env }
beforeEach(() => {
  process.env.SESSION_SECRET = 's'.repeat(40)
  process.env.TRUST_PROXY = '1'
  resetTrackThrottle()
})
afterEach(() => {
  process.env = { ...saved }
})

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost:3000/api/track', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'user-agent': UA, 'x-forwarded-for': '9.9.9.9', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never,
  )

describe('POST /api/track', () => {
  it('ignores bots (204, no row)', async () => {
    const res = await post({ path: '/uz/p/x', locale: 'uz', referrer: '' }, { 'user-agent': 'Googlebot/2.1' })
    expect(res.status).toBe(204)
    expect(await prisma.pageView.count()).toBe(0)
  })
  it('records a normal view', async () => {
    const res = await post({ path: '/uz/p/x', locale: 'uz', referrer: 'https://www.google.com/search?q=x' })
    expect(res.status).toBe(204)
    const rows = await prisma.pageView.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ path: '/uz/p/x', locale: 'uz', referrerHost: 'www.google.com', device: 'desktop' })
    expect(rows[0].visitorHash).toMatch(/^[0-9a-f]{32}$/)
  })
  it('stores own-host referrers as null', async () => {
    await post({ path: '/uz', locale: 'uz', referrer: 'http://localhost:3000/ru' })
    expect((await prisma.pageView.findMany())[0].referrerHost).toBeNull()
  })
  it('ignores non-storefront paths', async () => {
    for (const path of ['/admin', '/api/x', '/uzbek', '/']) {
      expect((await post({ path, locale: 'uz', referrer: '' })).status).toBe(204)
    }
    expect(await prisma.pageView.count()).toBe(0)
  })
  it('always 204 on garbage or oversized bodies, storing nothing', async () => {
    expect((await post('not json')).status).toBe(204)
    expect((await post({ path: '/uz/' + 'a'.repeat(3000), locale: 'uz', referrer: '' })).status).toBe(204)
    expect(await prisma.pageView.count()).toBe(0)
  })
  it('rate limits per ip but still answers 204', async () => {
    for (let i = 0; i < 125; i++) expect((await post({ path: '/uz', locale: 'uz', referrer: '' })).status).toBe(204)
    expect(await prisma.pageView.count()).toBe(120)
  })
})

describe('signed-in views', () => {
  const body = { path: '/uz/p/x', locale: 'uz', referrer: '' }
  const mkCustomer = (over: Record<string, unknown> = {}) =>
    prisma.customer.create({ data: { phone: '+998901234567', name: 'Aziz', region: 'samarkand', tags: [], telegramUserId: 'tg1', accountCreatedAt: new Date(), ...over } })
  const cookieFor = async (c: { id: number; sessionVersion: number }) => `${CUSTOMER_COOKIE}=${await createCustomerSession({ cid: c.id, sv: c.sessionVersion })}`
  const only = async () => (await prisma.pageView.findMany())[0]

  it('a valid session cookie -> signed-in view with the customer region', async () => {
    const c = await mkCustomer()
    const res = await post(body, { cookie: await cookieFor(c) })
    expect(res.status).toBe(204)
    expect(await only()).toMatchObject({ signedIn: true, region: 'samarkand' })
  })
  it('a signed-in view stamps last seen; guest and rejected views touch no customer', async () => {
    const c = await mkCustomer()
    const seen = async () => (await prisma.customer.findUnique({ where: { id: c.id } }))!.lastSeenAt
    await post(body)
    expect(await seen()).toBeNull()
    await post({ ...body, path: '/admin' }, { cookie: await cookieFor(c) }) // not a storefront page: nothing recorded
    expect(await seen()).toBeNull()
    const before = Date.now()
    await post(body, { cookie: await cookieFor(c) })
    const stamped = (await seen())!.getTime()
    expect(stamped).toBeGreaterThan(before - LAST_SEEN_STEP_MS)
    expect(stamped).toBeLessThanOrEqual(Date.now())
    expect((await prisma.customer.findUnique({ where: { id: c.id } }))!.lastLoginAt).toBeNull() // browsing is not signing in
  })
  it('last seen is a 5-minute slot, so it cannot be matched to the time of a page view', async () => {
    const c = await mkCustomer()
    await post(body, { cookie: await cookieFor(c) })
    const seen = (await prisma.customer.findUnique({ where: { id: c.id } }))!.lastSeenAt!
    expect(seen.getTime() % LAST_SEEN_STEP_MS).toBe(0)
  })
  it('a second signed-in view in the same slot writes nothing to the customer', async () => {
    const c = await mkCustomer()
    const cookie = await cookieFor(c)
    await post(body, { cookie })
    const spy = vi.spyOn(prisma.customer, 'updateMany')
    try {
      await post(body, { cookie })
      // Only meaningful while both views fall into one slot; skip the assertion on the rare slot boundary.
      const slot = (ms: number) => Math.floor(ms / LAST_SEEN_STEP_MS)
      const rows = await prisma.pageView.findMany({ orderBy: { id: 'asc' } })
      expect(rows).toHaveLength(2)
      if (slot(rows[0].createdAt.getTime()) === slot(rows[1].createdAt.getTime())) expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
  it('no cookie -> guest view, and no customer lookup', async () => {
    const spy = vi.spyOn(prisma.customer, 'findUnique')
    try {
      expect((await post(body)).status).toBe(204)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
    expect(await only()).toMatchObject({ signedIn: false, region: null })
  })
  it('garbage, revoked and deleted-account cookies -> guest view, still 204', async () => {
    const c = await mkCustomer()
    const stale = await cookieFor({ id: c.id, sessionVersion: c.sessionVersion + 1 })
    const gone = await mkCustomer({ phone: '+998900000001', telegramUserId: null, accountCreatedAt: null })
    for (const cookie of [`${CUSTOMER_COOKIE}=garbage`, stale, await cookieFor(gone)]) {
      expect((await post(body, { cookie })).status).toBe(204)
    }
    const rows = await prisma.pageView.findMany()
    expect(rows).toHaveLength(3)
    for (const r of rows) expect(r).toMatchObject({ signedIn: false, region: null })
  })
  it('a failing account lookup -> 204 and an unknown view, not a guest view', async () => {
    const c = await mkCustomer()
    const cookie = await cookieFor(c)
    const spy = vi.spyOn(prisma.customer, 'findUnique').mockRejectedValueOnce(new Error('db down') as never)
    try {
      expect((await post(body, { cookie })).status).toBe(204)
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
    expect(await only()).toMatchObject({ signedIn: null, region: null })
  })
})
