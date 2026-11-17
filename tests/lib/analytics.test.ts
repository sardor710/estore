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
