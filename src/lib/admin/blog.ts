import { prisma } from '@/lib/db'
import { locales } from '@/i18n/routing'
import type { L10n } from '@/lib/localized'
import { sanitizeHtml } from '@/lib/sanitize'
import { asL10n, asTags } from '@/lib/blog'
import { logActivity } from './activity'
import { fromTashkentLocal, toTashkentLocal } from './promotions'
import type { Staff } from './session'

export type PostStatus = 'DRAFT' | 'PUBLISHED'
export type PostState = 'draft' | 'scheduled' | 'published'

/** Editor payload. `publishedAt` is an Asia/Tashkent wall-clock value ("YYYY-MM-DDTHH:mm") or null. */
export type BlogPostInput = {
  slug: string
  status: PostStatus
  publishedAt: string | null
  title: L10n
  excerpt: L10n
  contentHtml: L10n
  seoTitle: L10n
  seoDescription: L10n
  coverImage: string | null
  tags: string[]
  reviewed: { uz: boolean; ru: boolean }
}

export type PostRow = {
  id: number
  slug: string
  title: string
  status: PostStatus
  state: PostState
  publishedAt: Date | null
  updatedAt: Date
}

export type SaveResult = { ok: true; id: number } | { ok: false; error: string }
export type SimpleResult = { ok: true } | { ok: false; error: string }

const SLUG_RE = /^[a-z0-9-]{3,80}$/
const COVER_RE = /^(https:\/\/\S+|\/uploads\/\d{4}\/\d{2}\/[0-9a-f]+\.(jpg|png|webp|gif))$/i
const MAX_TAGS = 10
const MAX_TAG = 40
const LIMITS = { title: 200, excerpt: 500, seoTitle: 120, seoDescription: 320, contentHtml: 200_000 }

export function postState(p: { status: string; publishedAt: Date | null }, now: Date): PostState {
  if (p.status !== 'PUBLISHED') return 'draft'
  return p.publishedAt && p.publishedAt > now ? 'scheduled' : 'published'
}

/** Keeps only uz/ru/en string values (sanitized when `html`), dropping empties; null when one is too long. */
function cleanL10n(v: unknown, max: number, html = false): L10n | null {
  const src = asL10n(v)
  const out: L10n = {}
  for (const l of locales) {
    const s = src[l]
    if (typeof s !== 'string') continue
    const val = html ? sanitizeHtml(s).trim() : s.trim()
    if (val.length > max) return null
    if (val) out[l] = val
  }
  return out
}

export async function listPosts(f: { q?: string; status?: string } = {}, now: Date = new Date()): Promise<PostRow[]> {
  const rows = await prisma.blogPost.findMany({
    where: f.status === 'DRAFT' || f.status === 'PUBLISHED' ? { status: f.status } : {},
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  const q = f.q?.trim().toLowerCase()
  return rows
    .map((r) => {
      const title = asL10n(r.title)
      return {
        id: r.id,
        slug: r.slug,
        title: title.en || title.uz || title.ru || r.slug,
        status: (r.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT') as PostStatus,
        state: postState(r, now),
        publishedAt: r.publishedAt,
        updatedAt: r.updatedAt,
      }
    })
    .filter((r) => !q || r.title.toLowerCase().includes(q) || r.slug.includes(q))
}

/** Stored post as editor input; null when missing. */
export async function loadPostInput(id: number): Promise<BlogPostInput | null> {
  const p = await prisma.blogPost.findUnique({ where: { id } })
  if (!p) return null
  const reviewed = (p.reviewed && typeof p.reviewed === 'object' ? p.reviewed : {}) as Record<string, unknown>
  return {
    slug: p.slug,
    status: p.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
    publishedAt: toTashkentLocal(p.publishedAt),
    title: asL10n(p.title),
    excerpt: asL10n(p.excerpt),
    contentHtml: asL10n(p.contentHtml),
    seoTitle: asL10n(p.seoTitle),
    seoDescription: asL10n(p.seoDescription),
    coverImage: p.coverImage,
    tags: asTags(p.tags),
    reviewed: { uz: reviewed.uz === true, ru: reviewed.ru === true },
  }
}

function cleanTags(v: unknown): string[] | null {
  if (!Array.isArray(v)) return []
  const tags = [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().toLowerCase()).filter(Boolean))]
  return tags.length > MAX_TAGS || tags.some((x) => x.length > MAX_TAG) ? null : tags
}

export async function savePost(id: number | null, input: BlogPostInput, actor: Staff): Promise<SaveResult> {
  if (id !== null && !Number.isInteger(id)) return { ok: false, error: 'Post not found.' }
  const slug = typeof input?.slug === 'string' ? input.slug.trim() : ''
  if (!SLUG_RE.test(slug)) return { ok: false, error: 'Slug must be 3 to 80 characters: a-z, 0-9 and dashes.' }
  if (input.status !== 'DRAFT' && input.status !== 'PUBLISHED') return { ok: false, error: 'Invalid status.' }

  const title = cleanL10n(input.title, LIMITS.title)
  const excerpt = cleanL10n(input.excerpt, LIMITS.excerpt)
  const contentHtml = cleanL10n(input.contentHtml, LIMITS.contentHtml, true)
  const seoTitle = cleanL10n(input.seoTitle, LIMITS.seoTitle)
  const seoDescription = cleanL10n(input.seoDescription, LIMITS.seoDescription)
  if (!title || !excerpt || !contentHtml || !seoTitle || !seoDescription) return { ok: false, error: 'A text field is too long.' }
  if (Object.keys(title).length === 0) return { ok: false, error: 'Enter a title in at least one language.' }

  const tags = cleanTags(input.tags)
  if (!tags) return { ok: false, error: `Up to ${MAX_TAGS} tags, each up to ${MAX_TAG} characters.` }
  const cover = typeof input.coverImage === 'string' ? input.coverImage.trim() : ''
  if (cover && !COVER_RE.test(cover)) return { ok: false, error: 'Cover image must be an uploaded image or an https URL.' }
  const given = fromTashkentLocal(input.publishedAt)
  if (given === undefined) return { ok: false, error: 'Publish date must be a valid date and time.' }
  const publishedAt = given ?? (input.status === 'PUBLISHED' ? new Date() : null)
  const reviewed = { uz: input.reviewed?.uz === true, ru: input.reviewed?.ru === true }

  const clash = await prisma.blogPost.findUnique({ where: { slug }, select: { id: true } })
  if (clash && clash.id !== id) return { ok: false, error: 'This slug is already used by another post.' }

  const data = { slug, status: input.status, publishedAt, title, excerpt, contentHtml, seoTitle, seoDescription, coverImage: cover || null, tags, reviewed }
  const label = title.en || title.uz || title.ru || slug
  try {
    if (id === null) {
      const p = await prisma.blogPost.create({ data: { ...data, authorId: actor.id > 0 ? actor.id : null } })
      await logActivity(actor, 'create', 'post', p.id, `Created post "${label}" (${input.status.toLowerCase()})`)
      return { ok: true, id: p.id }
    }
    const r = await prisma.blogPost.updateMany({ where: { id }, data })
    if (r.count !== 1) return { ok: false, error: 'Post not found.' }
    await logActivity(actor, 'update', 'post', id, `Updated post "${label}" (${input.status.toLowerCase()})`)
    return { ok: true, id }
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') return { ok: false, error: 'This slug is already used by another post.' }
    throw e
  }
}

export async function deletePost(id: number, actor: Staff): Promise<SimpleResult> {
  if (!Number.isInteger(id)) return { ok: false, error: 'Post not found.' }
  const p = await prisma.blogPost.findUnique({ where: { id }, select: { slug: true } })
  if (!p) return { ok: false, error: 'Post not found.' }
  const r = await prisma.blogPost.deleteMany({ where: { id } })
  if (r.count !== 1) return { ok: false, error: 'Post not found.' }
  await logActivity(actor, 'delete', 'post', id, `Deleted post "${p.slug}"`)
  return { ok: true }
}
