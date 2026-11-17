import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import { isPostVisible, listPublishedPosts, getPublishedPost, allTags } from '@/lib/blog'
import { savePost, deletePost, listPosts, postState, type BlogPostInput } from '@/lib/admin/blog'
import type { Staff } from '@/lib/admin/session'
import { translateBlogPost, type Translator } from '@/lib/translate'

const staff: Staff = { id: 0, email: 'editor@test', name: 'Editor', role: 'BLOG_EDITOR' }

const input = (over: Partial<BlogPostInput> = {}): BlogPostInput => ({
  slug: 'hello-world',
  status: 'PUBLISHED',
  publishedAt: null,
  title: { en: 'Hello', uz: 'Salom' },
  excerpt: { en: 'Short' },
  contentHtml: { en: '<p>Body</p>' },
  seoTitle: {},
  seoDescription: {},
  coverImage: null,
  tags: [],
  reviewed: { uz: false, ru: false },
  ...over,
})

async function mk(over: Partial<BlogPostInput> = {}) {
  const r = await savePost(null, input(over), staff)
  if (!r.ok) throw new Error(r.error)
  return r.id
}

describe('isPostVisible', () => {
  const now = new Date('2026-06-01T00:00:00Z')
  it('hides drafts', () => {
    expect(isPostVisible({ status: 'DRAFT', publishedAt: new Date('2026-01-01') }, now)).toBe(false)
  })
  it('hides published posts with a future date until it passes', () => {
    const p = { status: 'PUBLISHED', publishedAt: new Date('2026-07-01T00:00:00Z') }
    expect(isPostVisible(p, now)).toBe(false)
    expect(isPostVisible(p, new Date('2026-07-01T00:00:00Z'))).toBe(true)
    expect(isPostVisible(p, new Date('2026-07-02T00:00:00Z'))).toBe(true)
  })
  it('hides published posts without a date', () => {
    expect(isPostVisible({ status: 'PUBLISHED', publishedAt: null }, now)).toBe(false)
  })
})

describe('postState', () => {
  const now = new Date('2026-06-01T00:00:00Z')
  it('draft / scheduled / published', () => {
    expect(postState({ status: 'DRAFT', publishedAt: null }, now)).toBe('draft')
    expect(postState({ status: 'PUBLISHED', publishedAt: new Date('2026-07-01') }, now)).toBe('scheduled')
    expect(postState({ status: 'PUBLISHED', publishedAt: new Date('2026-05-01') }, now)).toBe('published')
  })
})

describe('savePost', () => {
  it('strips <script> from every locale of contentHtml', async () => {
    const id = await mk({ contentHtml: { en: '<p>ok</p><script>alert(1)</script>', ru: '<img src=x onerror=alert(1)>' } })
    const row = await prisma.blogPost.findUniqueOrThrow({ where: { id } })
    const html = row.contentHtml as Record<string, string>
    expect(html.en).toBe('<p>ok</p>')
    expect(html.ru ?? '').not.toMatch(/onerror|<script/i)
  })
  it('gives a PUBLISHED post without a date the current time', async () => {
    const before = Date.now()
    const id = await mk()
    const row = await prisma.blogPost.findUniqueOrThrow({ where: { id } })
    expect(row.publishedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(isPostVisible(row, new Date())).toBe(true)
  })
  it('rejects a duplicate slug and a bad slug', async () => {
    await mk()
    const dup = await savePost(null, input(), staff)
    expect(dup).toEqual({ ok: false, error: expect.stringMatching(/already/i) })
    expect((await savePost(null, input({ slug: 'Bad Slug' }), staff)).ok).toBe(false)
    expect((await savePost(null, input({ slug: 'ab' }), staff)).ok).toBe(false)
  })
  it('updates in place keeping the same slug, and records activity', async () => {
    const id = await mk()
    const r = await savePost(id, input({ title: { en: 'Changed' } }), staff)
    expect(r).toEqual({ ok: true, id })
    expect((await prisma.blogPost.findUniqueOrThrow({ where: { id } })).title).toEqual({ en: 'Changed' })
    expect(await prisma.activityLog.count({ where: { entity: 'post', entityId: String(id) } })).toBe(2)
  })
  it('requires a title and rejects foreign cover images', async () => {
    expect((await savePost(null, input({ title: {} }), staff)).ok).toBe(false)
    expect((await savePost(null, input({ coverImage: 'javascript:alert(1)' }), staff)).ok).toBe(false)
    expect((await savePost(null, input({ coverImage: '/uploads/2026/06/abc123.png' }), staff)).ok).toBe(true)
  })
  it('normalises tags', async () => {
    const id = await mk({ tags: [' Chargers ', 'chargers', 'Audio', ''] })
    expect((await prisma.blogPost.findUniqueOrThrow({ where: { id } })).tags).toEqual(['chargers', 'audio'])
  })
  it('deletePost removes it', async () => {
    const id = await mk()
    expect(await deletePost(id, staff)).toEqual({ ok: true })
    expect(await prisma.blogPost.count()).toBe(0)
    expect((await deletePost(id, staff)).ok).toBe(false)
  })
})

describe('public queries', () => {
  it('lists only visible posts, newest first, filtered by tag', async () => {
    await mk({ slug: 'old-post', publishedAt: '2026-01-01T10:00', tags: ['audio'] })
    await mk({ slug: 'new-post', publishedAt: '2026-03-01T10:00', tags: ['chargers', 'audio'] })
    await mk({ slug: 'a-draft', status: 'DRAFT', tags: ['audio'] })
    await mk({ slug: 'future-post', publishedAt: '2999-01-01T10:00', tags: ['audio'] })
    const all = await listPublishedPosts({ locale: 'en', page: 1 })
    expect(all.posts.map((p) => p.slug)).toEqual(['new-post', 'old-post'])
    expect(all.total).toBe(2)
    const tagged = await listPublishedPosts({ locale: 'en', page: 1, tag: 'chargers' })
    expect(tagged.posts.map((p) => p.slug)).toEqual(['new-post'])
    expect(await allTags()).toEqual(['audio', 'chargers'])
  })
  it('paginates 12 per page', async () => {
    for (let i = 0; i < 14; i++) await mk({ slug: `post-${String(i).padStart(2, '0')}`, publishedAt: `2026-02-${String(i + 1).padStart(2, '0')}T10:00` })
    const p1 = await listPublishedPosts({ locale: 'en', page: 1 })
    const p2 = await listPublishedPosts({ locale: 'en', page: 2 })
    expect(p1.posts).toHaveLength(12)
    expect(p2.posts).toHaveLength(2)
    expect(p1.total).toBe(14)
  })
  it('card falls back across locales via t()', async () => {
    await mk({ slug: 'only-en', title: { en: 'English only' }, publishedAt: '2026-01-01T10:00' })
    const { posts } = await listPublishedPosts({ locale: 'ru', page: 1 })
    expect(posts[0].title).toBe('English only')
  })
  it('getPublishedPost hides drafts and future posts', async () => {
    await mk({ slug: 'a-draft', status: 'DRAFT' })
    await mk({ slug: 'future-post', publishedAt: '2999-01-01T10:00' })
    await mk({ slug: 'live-post', publishedAt: '2026-01-01T10:00' })
    expect(await getPublishedPost('a-draft')).toBeNull()
    expect(await getPublishedPost('future-post')).toBeNull()
    expect((await getPublishedPost('live-post'))?.slug).toBe('live-post')
  })
  it('listPosts filters by q and status', async () => {
    await mk({ slug: 'alpha-post', title: { en: 'Alpha' } })
    await mk({ slug: 'beta-post', status: 'DRAFT', title: { en: 'Beta' } })
    expect((await listPosts({ q: 'alph' })).map((r) => r.slug)).toEqual(['alpha-post'])
    expect((await listPosts({ status: 'DRAFT' })).map((r) => r.slug)).toEqual(['beta-post'])
  })
})

describe('translateBlogPost', () => {
  const fake: Translator = { translate: async (texts, to) => texts.map((s) => `[${to}] ${s}`) }

  it('translates EN into non-reviewed locales, sanitizing HTML, and keeps reviewed ones', async () => {
    const id = await mk({ title: { en: 'Hello', ru: 'Привет' }, contentHtml: { en: '<p>Body</p>' }, reviewed: { uz: false, ru: true } })
    const r = await translateBlogPost(id, { translator: fake })
    expect(r.status).toBe('done')
    const row = await prisma.blogPost.findUniqueOrThrow({ where: { id } })
    expect(row.title).toEqual({ en: 'Hello', ru: 'Привет', uz: '[uz] Hello' })
    expect((row.contentHtml as Record<string, string>).uz).toBe('[uz] <p>Body</p>')
    expect((row.contentHtml as Record<string, string>).ru).toBeUndefined()
  })
  it('force overwrites reviewed locales', async () => {
    const id = await mk({ title: { en: 'Hello', ru: 'Привет' }, reviewed: { uz: false, ru: true } })
    await translateBlogPost(id, { translator: fake, force: true })
    expect((await prisma.blogPost.findUniqueOrThrow({ where: { id } })).title).toMatchObject({ ru: '[ru] Hello' })
  })
  it('reports not_configured without an API key', async () => {
    const saved = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    try {
      const id = await mk()
      expect(await translateBlogPost(id)).toEqual({ status: 'not_configured', translated: 0 })
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved
    }
  })
})
