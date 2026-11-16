import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db'
import { locales } from '@/i18n/routing'
import { alternatesFor, SITE_URL } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, products] = await Promise.all([
    prisma.category.findMany({ select: { slug: true } }),
    prisma.product.findMany({
      where: { status: 'PUBLISHED', isDemo: false },
      select: { slug: true, updatedAt: true },
    }),
  ])
  const items: { path: string; lastModified?: Date }[] = [
    { path: '/' },
    ...categories.map((c) => ({ path: `/c/${c.slug}` })),
    ...products.map((p) => ({ path: `/p/${p.slug}`, lastModified: p.updatedAt })),
  ]
  return items.flatMap((it) => {
    const { languages } = alternatesFor(it.path)
    return locales.map((l) => ({
      url: languages[l],
      ...(it.lastModified ? { lastModified: it.lastModified } : {}),
      alternates: { languages },
    }))
  })
}
