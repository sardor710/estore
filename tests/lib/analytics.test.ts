import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/db'
import { tashkentDay, isBot, deviceOf, visitorHash } from '@/lib/analytics/visitor'

const saved = { ...process.env }
beforeEach(() => {
  process.env.SESSION_SECRET = 's'.repeat(40)
})
afterEach(() => {
  process.env = { ...saved }
})

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'

describe('tashkentDay', () => {
  it('uses UTC+5 calendar days', () => {
    expect(tashkentDay(new Date('2026-12-01T20:30:00Z'))).toBe('2026-12-02')
    expect(tashkentDay(new Date('2026-12-01T18:59:59Z'))).toBe('2026-12-01')
  })
})

describe('isBot', () => {
  it.each([
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; YandexBot/3.0)',
    'Slackbot-LinkExpanding 1.0',
    'Mozilla/5.0 HeadlessChrome/120',
    'Mozilla/5.0 Chrome-Lighthouse',
    'Twitterbot link preview',
    '',
  ])('flags %j', (ua) => expect(isBot(ua)).toBe(true))
  it('lets real browsers through', () => {
    expect(isBot(IPHONE)).toBe(false)
    expect(isBot(DESKTOP)).toBe(false)
  })
})

describe('deviceOf', () => {
  it('classifies', () => {
    expect(deviceOf(IPHONE)).toBe('mobile')
    expect(deviceOf(IPAD)).toBe('tablet')
    expect(deviceOf(DESKTOP)).toBe('desktop')
    expect(deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36')).toBe('mobile')
    expect(deviceOf('Mozilla/5.0 (Linux; Android 14; SM-X900) Safari/537.36')).toBe('tablet')
  })
})

describe('visitorHash', () => {
  it('is stable within a day, differs across days, ips and uas', async () => {
    const a = await visitorHash('1.2.3.4', DESKTOP, '2026-12-01')
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(await visitorHash('1.2.3.4', DESKTOP, '2026-12-01')).toBe(a)
    expect(await visitorHash('1.2.3.4', DESKTOP, '2026-12-02')).not.toBe(a)
    expect(await visitorHash('1.2.3.5', DESKTOP, '2026-12-01')).not.toBe(a)
    expect(await visitorHash('1.2.3.4', IPHONE, '2026-12-01')).not.toBe(a)
  })
  it('does not contain the raw ip', async () => {
    expect(await visitorHash('1.2.3.4', DESKTOP, '2026-12-01')).not.toContain('1.2.3.4')
  })
  it('is keyed by a random per-day salt stored in Setting, not by SESSION_SECRET', async () => {
    const h = await visitorHash('1.2.3.4', DESKTOP, '2026-12-09')
    const salt = await prisma.setting.findUnique({ where: { key: 'visitorSalt:2026-12-09' } })
    expect(salt?.value).toMatch(/^[0-9a-f]{64}$/)
    process.env.SESSION_SECRET = 'q'.repeat(40)
    expect(await visitorHash('1.2.3.4', DESKTOP, '2026-12-09')).toBe(h)
  })
})

describe('recordPageView caps and housekeeping', () => {
  const NOW = new Date('2026-12-05T08:00:00Z')
  const view = (over: Partial<import('@/lib/analytics/record').PageViewInput> = {}) =>
    import('@/lib/analytics/record').then((m) => m.recordPageView({ path: '/uz', locale: 'uz', referrer: '', ip: '1.2.3.4', ua: DESKTOP, now: NOW, ...over }))

  it('stores at most perVisitorPerDay views per visitor and day; other visitors and days are unaffected', async () => {
    const { trackLimits } = await import('@/lib/analytics/record')
    const old = trackLimits.perVisitorPerDay
    trackLimits.perVisitorPerDay = 3
    try {
      for (let n = 0; n < 3; n++) expect(await view()).toBe(true)
      expect(await view()).toBe(false)
      expect(await prisma.pageView.count()).toBe(3)
      expect(await view({ ip: '9.9.9.9' })).toBe(true)
      expect(await view({ now: new Date('2026-12-06T08:00:00Z') })).toBe(true)
    } finally {
      trackLimits.perVisitorPerDay = old
    }
  })
  it('the real default is 200 per visitor and day', async () => {
    const { trackLimits } = await import('@/lib/analytics/record')
    expect(trackLimits).toMatchObject({ perVisitorPerDay: 200, globalPerDay: 200_000 })
  })
  it('a restart (empty in-memory counters) still honours the cap through the DB count', async () => {
    const { trackLimits, resetTrackState } = await import('@/lib/analytics/record')
    trackLimits.perVisitorPerDay = 2
    try {
      await view()
      await view()
      resetTrackState()
      expect(await view()).toBe(false)
      expect(await prisma.pageView.count()).toBe(2)
    } finally {
      trackLimits.perVisitorPerDay = 200
    }
  })
  it('honours the global per-day cap', async () => {
    const { trackLimits } = await import('@/lib/analytics/record')
    trackLimits.globalPerDay = 2
    try {
      expect(await view({ ip: '1.1.1.1' })).toBe(true)
      expect(await view({ ip: '2.2.2.2' })).toBe(true)
      expect(await view({ ip: '3.3.3.3' })).toBe(false)
      expect(await prisma.pageView.count()).toBe(2)
    } finally {
      trackLimits.globalPerDay = 200_000
    }
  })
  it('rolls up and prunes at most once per Tashkent day per process', async () => {
    const { housekeepingIdle } = await import('@/lib/analytics/record')
    const d1 = new Date('2026-12-03T08:00:00Z')
    await view({ now: d1 }) // creates the 2026-12-03 salt
    await housekeepingIdle()
    const d2 = new Date('2026-12-04T08:00:00Z')
    await view({ now: d2 }) // first view of a new day: housekeeping runs
    await housekeepingIdle()
    expect(await prisma.dailyTraffic.findUnique({ where: { day: '2026-12-03' } })).toMatchObject({ views: 1, visitors: 1 })
    expect(await prisma.setting.findUnique({ where: { key: 'visitorSalt:2026-12-03' } })).toBeNull()
    await prisma.dailyTraffic.deleteMany() // yesterday would be re-aggregated if housekeeping ran again
    await view({ now: d2, ip: '5.5.5.5' })
    await housekeepingIdle()
    expect(await prisma.dailyTraffic.count()).toBe(0)
  })
})
