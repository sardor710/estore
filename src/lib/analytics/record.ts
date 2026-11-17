import { prisma } from '@/lib/db'
import { rollupAndPrune } from './rollup'
import { deviceOf, isBot, tashkentDay, visitorHash } from './visitor'

export type PageViewInput = {
  path: string
  locale: string
  referrer: string
  ip: string
  ua: string
  now: Date
  /** Hostnames that count as "ourselves" (the request's own host and SITE_URL's host). */
  ownHosts?: string[]
}

const STOREFRONT_PATH = /^\/(uz|ru|en)(\/|$)/
const MAX_PATH = 200

/** Storage caps for the public, unauthenticated beacon. Mutable so tests can lower them. */
export const trackLimits = { perVisitorPerDay: 200, globalPerDay: 200_000 }
const MAX_TRACKED_VISITORS = 200_000

// Per-process counters. They are seeded from the DB on first use per day (so a restart does not reset the caps)
// and then advanced synchronously, which keeps the hot path to one insert.
let globalState: { day: string; n: number | null; seed: Promise<number> } | null = null
const visitorCounts = new Map<string, number>()
let visitorDay = ''
let housekeepingDay = ''
let housekeeping: Promise<void> = Promise.resolve()

/** Test helper: forget every in-memory counter and the once-per-day housekeeping marker. */
export function resetTrackState(): void {
  globalState = null
  visitorCounts.clear()
  visitorDay = ''
  housekeepingDay = ''
  housekeeping = Promise.resolve()
}

/** Test helper: resolves when the fire-and-forget housekeeping started by recordPageView has finished. */
export function housekeepingIdle(): Promise<void> {
  return housekeeping
}

async function reserveGlobal(day: string): Promise<boolean> {
  if (!globalState || globalState.day !== day) globalState = { day, n: null, seed: prisma.pageView.count({ where: { day } }) }
  const st = globalState
  const base = await st.seed
  if (st.n === null) st.n = base
  if (st.n >= trackLimits.globalPerDay) return false
  st.n++
  return true
}

function releaseGlobal(day: string): void {
  if (globalState && globalState.day === day && globalState.n) globalState.n--
}

async function reserveVisitor(day: string, hash: string): Promise<boolean> {
  if (visitorDay !== day || visitorCounts.size > MAX_TRACKED_VISITORS) {
    visitorCounts.clear()
    visitorDay = day
  }
  let n = visitorCounts.get(hash)
  if (n === undefined) {
    const seeded = await prisma.pageView.count({ where: { day, visitorHash: hash } })
    n = visitorCounts.get(hash) ?? seeded // a concurrent request may have seeded it meanwhile
  }
  if (n >= trackLimits.perVisitorPerDay) {
    visitorCounts.set(hash, n)
    return false
  }
  visitorCounts.set(hash, n + 1)
  return true
}

function releaseVisitor(day: string, hash: string): void {
  const n = visitorCounts.get(hash)
  if (visitorDay === day && n) visitorCounts.set(hash, n - 1)
}

/** Rolls up and prunes (incl. finished-day salts) at most once per Tashkent day per process; never throws or blocks. */
function triggerHousekeeping(day: string, now: Date): void {
  if (housekeepingDay === day) return
  housekeepingDay = day
  housekeeping = rollupAndPrune(now).catch((e) => {
    console.error('[analytics] housekeeping failed', e)
  })
}

function hostOf(url: string): string | null {
  if (!url) return null
  try {
    const h = new URL(url).hostname.toLowerCase()
    return h || null
  } catch {
    return null
  }
}

/**
 * Stores one page view. False (nothing stored) for bots, anything that is not a storefront page, a visitor above
 * trackLimits.perVisitorPerDay views today, or a day above trackLimits.globalPerDay raw rows.
 */
export async function recordPageView(i: PageViewInput): Promise<boolean> {
  if (isBot(i.ua)) return false
  const path = i.path.split(/[?#]/)[0]
  if (path.length > MAX_PATH || !STOREFRONT_PATH.test(path)) return false
  const locale = path.slice(1, 3)
  const host = hostOf(i.referrer)
  const own = (i.ownHosts ?? []).map((h) => h.toLowerCase())
  const day = tashkentDay(i.now)
  triggerHousekeeping(day, i.now)
  if (!(await reserveGlobal(day))) return false
  const hash = await visitorHash(i.ip, i.ua, day)
  if (!(await reserveVisitor(day, hash))) {
    releaseGlobal(day)
    return false
  }
  try {
    await prisma.pageView.create({
      data: {
        day,
        path,
        locale,
        referrerHost: host && !own.includes(host) ? host : null,
        device: deviceOf(i.ua),
        visitorHash: hash,
        createdAt: i.now,
      },
    })
  } catch (e) {
    releaseGlobal(day)
    releaseVisitor(day, hash)
    throw e
  }
  return true
}
