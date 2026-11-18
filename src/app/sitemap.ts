import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db'
import { locales } from '@/i18n/routing'
import { alternatesFor } from '@/lib/seo'
import { listSitemapPosts } from '@/lib/blog'
import { LEGAL_DOCS } from '@/lib/legal/types'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, products, posts] = await Promise.all([
    prisma.category.findMany({ select: { slug: true } }),
    prisma.product.findMany({
      where: { status: 'PUBLISHED', isDemo: false },
      select: { slug: true, updatedAt: true },
    }),
    listSitemapPosts(),
  ])
  const items: { path: string; lastModified?: Date }[] = [
    { path: '/' },
    { path: '/blog' },
    ...LEGAL_DOCS.map((d) => ({ path: `/legal/${d}` })),
    ...categories.map((c) => ({ path: `/c/${c.slug}` })),
    ...products.map((p) => ({ path: `/p/${p.slug}`, lastModified: p.updatedAt })),
    ...posts.map((p) => ({ path: `/blog/${p.slug}`, lastModified: p.updatedAt })),
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
