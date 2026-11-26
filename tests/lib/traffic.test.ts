import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import { getDashboard, resolveRange } from '@/lib/admin/dashboard'
import { getTraffic } from '@/lib/admin/traffic'
import { tashkentDateTime } from '@/lib/analytics/visitor'

const NOW = new Date('2026-12-05T08:00:00Z') // Saturday 2026-12-05, 13:00 in Tashkent
const oneDay = (day: string) => resolveRange('custom', day, day, NOW)

type ViewOpts = { signedIn?: boolean | null; region?: string | null; at?: string }
/** One page view. `at` is the UTC instant; by default 06:00 UTC (11:00 Tashkent) of `day`. */
const view = (day: string, hash: string, o: ViewOpts = {}) =>
  prisma.pageView.create({
    data: {
      day, path: '/uz', locale: 'uz', device: 'mobile', visitorHash: hash,
      signedIn: o.signedIn === undefined ? false : o.signedIn,
      region: o.region ?? null,
      createdAt: new Date(o.at ?? `${day}T06:00:00Z`),
    },
  })

let phoneSeq = 0
const customer = (over: Record<string, unknown> = {}) =>
  prisma.customer.create({
    data: { phone: `+99890${String(1000000 + ++phoneSeq)}`, name: `C${phoneSeq}`, region: 'samarkand', tags: [], accountCreatedAt: new Date('2026-01-01T00:00:00Z'), ...over },
  })

describe('tashkentDateTime', () => {
  it('prints the Tashkent wall clock', () => {
    expect(tashkentDateTime(new Date('2026-12-04T19:30:00Z'))).toBe('2026-12-05 00:30')
    expect(tashkentDateTime(new Date('2026-12-04T10:15:00Z'))).toBe('2026-12-04 15:15')
  })
})

describe('getTraffic: guests, signed-in and unknown', () => {
  it('splits a day into signed-in, guests and unknown visitors that add up to Visitors', async () => {
    const day = '2026-12-02'
    await view(day, 'a', { signedIn: false })
    await view(day, 'a', { signedIn: true, region: 'samarkand' }) // browsed as a guest, then signed in: counts once, as signed-in
    await view(day, 'b', { signedIn: false })
    await view(day, 'c', { signedIn: null })
    await view(day, 'd', { signedIn: null })
    await view(day, 'd', { signedIn: false })

    const range = oneDay(day)
    const t = await getTraffic(range)
    expect(t.perDay).toEqual([{ day, signedIn: 1, guests: 2, unknown: 1 }])
    expect(t.kpis.signedIn.value).toBe(1)
    expect(t.kpis.guests.value).toBe(2)
    const visitors = (await getDashboard(range, NOW)).kpis.visitors.value
    expect(visitors).toBe(4)
    expect(t.perDay[0].signedIn + t.perDay[0].guests + t.perDay[0].unknown).toBe(visitors)
  })

  it('days recorded before the split are unknown, never guests', async () => {
    await view('2026-12-01', 'a', { signedIn: null })
    await view('2026-12-03', 'b', { signedIn: false })
    const t = await getTraffic(resolveRange('custom', '2026-12-01', '2026-12-03', NOW))
    expect(t.perDay).toEqual([
      { day: '2026-12-01', signedIn: 0, guests: 0, unknown: 1 },
      { day: '2026-12-02', signedIn: 0, guests: 0, unknown: 0 },
      { day: '2026-12-03', signedIn: 0, guests: 1, unknown: 0 },
    ])
    expect(t.splitSince).toBe('2026-12-03')
    expect(t.kpis.guests.value).toBe(1)
  })

  it('splitSince is null while no view carries the split yet', async () => {
    await view('2026-12-01', 'a', { signedIn: null })
    const t = await getTraffic(oneDay('2026-12-01'))
    expect(t.splitSince).toBeNull()
    expect(t.rawSince).toBe('2026-12-01')
  })

  it('a day whose raw rows were pruned keeps its visitors, as unknown', async () => {
    await prisma.dailyTraffic.create({ data: { day: '2026-05-01', views: 40, visitors: 7 } })
    const t = await getTraffic(oneDay('2026-05-01'))
    expect(t.perDay).toEqual([{ day: '2026-05-01', signedIn: 0, guests: 0, unknown: 7 }])
    expect(t.rawSince).toBeNull()
  })

  it('the equally long period before feeds prev', async () => {
    await view('2026-12-01', 'p', { signedIn: true, region: 'samarkand' })
    await view('2026-12-01', 'q', { signedIn: false })
    await view('2026-12-02', 'r', { signedIn: false })
    const t = await getTraffic(oneDay('2026-12-02'))
    expect(t.kpis.signedIn).toEqual({ value: 0, prev: 1 })
    expect(t.kpis.guests).toEqual({ value: 1, prev: 1 })
  })
})

describe('getTraffic: busiest hours and weekdays', () => {
  it('hours use Tashkent time, also across midnight', async () => {
    await view('2026-12-05', 'a', { at: '2026-12-04T19:30:00Z' }) // 00:30 Saturday in Tashkent
    await view('2026-12-05', 'b', { at: '2026-12-05T10:15:00Z' }) // 15:15
    await view('2026-12-05', 'c', { at: '2026-12-05T10:45:00Z' }) // 15:45
    const t = await getTraffic(oneDay('2026-12-05'))
    expect(t.hours).toHaveLength(24)
    expect(t.hours[0]).toBe(1)
    expect(t.hours[15]).toBe(2)
    expect(t.hours.reduce((s, n) => s + n, 0)).toBe(3)
    expect(t.peakHour).toBe(15)
  })

  it('no views -> all zero and no peak', async () => {
    const t = await getTraffic(oneDay('2026-12-05'))
    expect(t.hours).toEqual(Array(24).fill(0))
    expect(t.weekdays).toEqual(Array(7).fill(0))
    expect(t.peakHour).toBeNull()
    expect(t.peakWeekday).toBeNull()
  })

  it('weekdays are per-day averages (Monday first) and skip days before tracking started', async () => {
    // Two of every weekday in the range; the first raw row ever is on Saturday 2026-11-28.
    for (const h of ['a', 'b', 'c', 'd']) await view('2026-11-28', h) // Saturday: 4 views
    for (const h of ['a', 'b']) await view('2026-11-30', h) // Monday: 2 views
    for (const h of ['a', 'b']) await view('2026-12-05', h, { at: '2026-12-04T19:30:00Z' }) // Saturday: 2 views
    const t = await getTraffic(resolveRange('custom', '2026-11-22', '2026-12-05', NOW))
    expect(t.rawSince).toBe('2026-11-28')
    expect(t.weekdays).toHaveLength(7)
    expect(t.weekdays[5]).toBe(3) // (4 + 2) / 2 Saturdays
    expect(t.weekdays[0]).toBe(2) // Monday 11-23 is before tracking: 2 / 1, not 2 / 2
    expect(t.weekdays[2]).toBe(0)
    expect(t.peakWeekday).toBe(5)
  })

  it('an earlier bucket wins a tie for the peak', async () => {
    await view('2026-11-30', 'a') // Monday
    await view('2026-12-05', 'b') // Saturday, same 11:00 hour
    const t = await getTraffic(resolveRange('custom', '2026-11-30', '2026-12-05', NOW))
    expect(t.peakWeekday).toBe(0)
    expect(t.peakHour).toBe(11)
  })
})

describe('getTraffic: regions, sign-ins, new accounts', () => {
  it('regions count signed-in daily visitors; guests are left out', async () => {
    await view('2026-12-02', 'a', { signedIn: true, region: 'samarkand' })
    await view('2026-12-02', 'a', { signedIn: true, region: 'samarkand' }) // same visitor, same day: once
    await view('2026-12-02', 'b', { signedIn: true, region: 'samarkand' })
    await view('2026-12-02', 'c', { signedIn: true, region: 'tashkent-city' })
    await view('2026-12-03', 'c2', { signedIn: true, region: 'tashkent-city' }) // another day: counts again
    await view('2026-12-03', 'e', { signedIn: true, region: null })
    await view('2026-12-03', 'f', { signedIn: false })
    const t = await getTraffic(resolveRange('custom', '2026-12-02', '2026-12-03', NOW))
    expect(t.regions).toEqual([
      { code: 'samarkand', name: 'Samarkand region', visitors: 2 },
      { code: 'tashkent-city', name: 'Tashkent city', visitors: 2 },
      { code: '', name: 'Not set', visitors: 1 },
    ])
  })

  it('recent sign-ins: newest first, 20 at most, existing accounts only, whatever the range', async () => {
    const t0 = new Date('2026-11-01T06:00:00Z').getTime()
    for (let i = 0; i < 22; i++) await customer({ lastLoginAt: new Date(t0 + i * 60_000), lastSeenAt: new Date(t0 + i * 60_000 + 1000) })
    await customer({ name: 'Deleted', accountCreatedAt: null, lastLoginAt: new Date(t0 + 99 * 60_000) })
    await customer({ name: 'Never', lastLoginAt: null })
    const t = await getTraffic(oneDay('2026-12-05'))
    expect(t.recentSignIns).toHaveLength(20)
    expect(t.recentSignIns[0].lastLoginAt).toEqual(new Date(t0 + 21 * 60_000))
    expect(t.recentSignIns[0].lastSeenAt).toEqual(new Date(t0 + 21 * 60_000 + 1000))
    expect(t.recentSignIns[19].lastLoginAt).toEqual(new Date(t0 + 2 * 60_000))
    expect(t.recentSignIns[0].region).toBe('Samarkand region')
    expect(t.recentSignIns.map((r) => r.name)).not.toContain('Deleted')
    expect(t.recentSignIns.map((r) => r.name)).not.toContain('Never')
  })

  it('a sign-in row shows a readable region even when the profile has none', async () => {
    await customer({ region: '', lastLoginAt: new Date('2026-11-01T06:00:00Z') })
    const t = await getTraffic(oneDay('2026-12-05'))
    expect(t.recentSignIns[0].region).toBe('Not set')
  })

  it('new accounts are counted by creation time inside the range', async () => {
    const range = oneDay('2026-12-02') // 2026-12-01T19:00Z .. 2026-12-02T19:00Z
    await customer({ accountCreatedAt: new Date('2026-12-02T10:00:00Z') })
    await customer({ accountCreatedAt: range.to }) // the first instant of the next day
    await customer({ accountCreatedAt: new Date('2026-12-01T10:00:00Z') }) // previous period
    await customer({ accountCreatedAt: null, createdAt: new Date('2026-12-02T10:00:00Z') }) // order-only client
    const t = await getTraffic(range)
    expect(t.kpis.newAccounts).toEqual({ value: 1, prev: 1 })
  })
})

describe('getTraffic: is the guest / signed-in split usable for this range?', () => {
  it('nothing tracked yet -> not in range, not comparable', async () => {
    await view('2026-12-02', 'a', { signedIn: null })
    const t = await getTraffic(oneDay('2026-12-02'))
    expect(t.splitInRange).toBe(false)
    expect(t.prevComparable).toBe(false)
  })
  it('the range lies entirely before the split started -> not in range', async () => {
    await view('2026-12-04', 'a', { signedIn: false })
    const t = await getTraffic(oneDay('2026-12-02'))
    expect(t.splitInRange).toBe(false)
    expect(t.prevComparable).toBe(false)
  })
  it('the split started inside the previous period -> shown, but not compared with it', async () => {
    // range 2026-12-03..05, previous period 2026-11-30..12-02; tracking starts on 12-01
    await view('2026-12-01', 'a', { signedIn: false })
    await view('2026-12-04', 'b', { signedIn: false })
    const t = await getTraffic(resolveRange('custom', '2026-12-03', '2026-12-05', NOW))
    expect(t.splitInRange).toBe(true)
    expect(t.prevComparable).toBe(false)
  })
  it('the whole previous period was tracked -> comparable', async () => {
    await view('2026-11-30', 'a', { signedIn: false })
    await view('2026-12-04', 'b', { signedIn: false })
    const t = await getTraffic(resolveRange('custom', '2026-12-03', '2026-12-05', NOW))
    expect(t.splitInRange).toBe(true)
    expect(t.prevComparable).toBe(true)
  })
})
