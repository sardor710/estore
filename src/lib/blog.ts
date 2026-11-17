import { prisma } from '@/lib/db'
import type { Locale } from '@/i18n/routing'
import { t, type L10n } from '@/lib/localized'
import { stripHtml, truncate } from '@/lib/seo'

export const BLOG_PAGE_SIZE = 12

export type PostCard = {
  slug: string
  title: string
  excerpt: string
  coverImage: string | null
  publishedAt: Date
  tags: string[]
}

/** Raw (all-locale) post for the detail page; pick text with `t(field, locale)`. */
export type PostDetail = {
  id: number
  slug: string
  title: L10n
  excerpt: L10n
  contentHtml: L10n
  seoTitle: L10n
  seoDescription: L10n
  coverImage: string | null
  tags: string[]
  publishedAt: Date
  updatedAt: Date
}

/** Public visibility: PUBLISHED and its publish date has arrived (a future date means scheduled). */
export function isPostVisible(p: { status: string; publishedAt: Date | null }, now: Date): boolean {
  return p.status === 'PUBLISHED' && p.publishedAt !== null && p.publishedAt <= now
}

export const asL10n = (v: unknown): L10n => (v && typeof v === 'object' && !Array.isArray(v) ? (v as L10n) : {})
export const asTags = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

type Row = Awaited<ReturnType<typeof prisma.blogPost.findFirstOrThrow>>

/** DB filter equivalent of isPostVisible. */
const visibleWhere = (now: Date) => ({ status: 'PUBLISHED', publishedAt: { lte: now } })

function toCard(p: Row, locale: Locale): PostCard {
  const excerpt = t(asL10n(p.excerpt), locale) || truncate(stripHtml(t(asL10n(p.contentHtml), locale)), 160)
  return {
    slug: p.slug,
    title: t(asL10n(p.title), locale),
    excerpt,
    coverImage: p.coverImage,
    publishedAt: p.publishedAt as Date,
    tags: asTags(p.tags),
  }
}

/** Published posts, newest first, 12 per page. Tags are a JSON array, so the tag filter runs in memory (small table). */
export async function listPublishedPosts(o: { locale: Locale; page: number; tag?: string }): Promise<{ posts: PostCard[]; total: number }> {
  const rows = await prisma.blogPost.findMany({ where: visibleWhere(new Date()), orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }] })
  const tag = o.tag?.trim().toLowerCase()
  const filtered = tag ? rows.filter((r) => asTags(r.tags).includes(tag)) : rows
  const page = Math.max(1, Math.floor(o.page) || 1)
  return {
    posts: filtered.slice((page - 1) * BLOG_PAGE_SIZE, page * BLOG_PAGE_SIZE).map((r) => toCard(r, o.locale)),
    total: filtered.length,
  }
}

export async function getPublishedPost(slug: string): Promise<PostDetail | null> {
  const p = await prisma.blogPost.findFirst({ where: { slug, ...visibleWhere(new Date()) } })
  if (!p) return null
  return {
    id: p.id,
    slug: p.slug,
    title: asL10n(p.title),
    excerpt: asL10n(p.excerpt),
    contentHtml: asL10n(p.contentHtml),
    seoTitle: asL10n(p.seoTitle),
    seoDescription: asL10n(p.seoDescription),
    coverImage: p.coverImage,
    tags: asTags(p.tags),
    publishedAt: p.publishedAt as Date,
    updatedAt: p.updatedAt,
  }
}

/** Distinct tags across visible posts, sorted. */
export async function allTags(): Promise<string[]> {
  const rows = await prisma.blogPost.findMany({ where: visibleWhere(new Date()), select: { tags: true } })
  return [...new Set(rows.flatMap((r) => asTags(r.tags)))].sort()
}

/** Up to `limit` other visible posts sharing a tag with `post`, newest first. */
export async function getRelatedPosts(post: { id: number; tags: string[] }, locale: Locale, limit = 3): Promise<PostCard[]> {
  if (post.tags.length === 0) return []
  const rows = await prisma.blogPost.findMany({
    where: { ...visibleWhere(new Date()), id: { not: post.id } },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
  })
  return rows.filter((r) => asTags(r.tags).some((x) => post.tags.includes(x))).slice(0, limit).map((r) => toCard(r, locale))
}

/** Visible post slugs for the sitemap. */
export async function listSitemapPosts(): Promise<{ slug: string; updatedAt: Date }[]> {
  return prisma.blogPost.findMany({ where: visibleWhere(new Date()), select: { slug: true, updatedAt: true } })
}
