import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/db'
import { POST } from '@/app/api/track/route'
import { resetTrackThrottle } from '@/lib/analytics/track-throttle'

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
