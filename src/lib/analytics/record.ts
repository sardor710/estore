import { prisma } from '@/lib/db'
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

function hostOf(url: string): string | null {
  if (!url) return null
  try {
    const h = new URL(url).hostname.toLowerCase()
    return h || null
  } catch {
    return null
  }
}

/** Stores one page view. False (nothing stored) for bots and anything that is not a storefront page. */
export async function recordPageView(i: PageViewInput): Promise<boolean> {
  if (isBot(i.ua)) return false
  const path = i.path.split(/[?#]/)[0]
  if (path.length > MAX_PATH || !STOREFRONT_PATH.test(path)) return false
  const locale = path.slice(1, 3)
  const host = hostOf(i.referrer)
  const own = (i.ownHosts ?? []).map((h) => h.toLowerCase())
  const day = tashkentDay(i.now)
  await prisma.pageView.create({
    data: {
      day,
      path,
      locale,
      referrerHost: host && !own.includes(host) ? host : null,
      device: deviceOf(i.ua),
      visitorHash: await visitorHash(i.ip, i.ua, day),
      createdAt: i.now,
    },
  })
  return true
}
