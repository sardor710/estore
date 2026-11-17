import { prisma } from '@/lib/db'
import type { Locale } from '@/i18n/routing'
import { t, type L10n } from '@/lib/localized'
import { bannerHref } from '@/lib/banner-link'

export { bannerHref } from '@/lib/banner-link'

/** One homepage slide, already localized for the viewer. Empty strings mean "not shown". */
export type PublicBanner = {
  id: number
  title: string
  text: string
  buttonText: string
  imageUrl: string
  mobileImageUrl: string | null
  href: string | null
}

/** Switched-on banners whose schedule includes `now`, in admin order; text falls back locale -> uz -> other locales. */
export async function getActiveBanners(locale: Locale, now: Date = new Date()): Promise<PublicBanner[]> {
  const rows = await prisma.banner.findMany({
    where: {
      active: true,
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  })
  return rows.map((b) => ({
    id: b.id,
    title: t(b.title as L10n, locale),
    text: t(b.text as L10n, locale),
    buttonText: t(b.buttonText as L10n, locale),
    imageUrl: b.imageUrl,
    mobileImageUrl: b.mobileImageUrl,
    href: bannerHref(locale, b.linkUrl),
  }))
}
