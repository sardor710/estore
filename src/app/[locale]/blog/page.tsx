import type { Metadata } from 'next'
import Link from 'next/link'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { routing, type Locale } from '@/i18n/routing'
import { pageMetadata } from '@/lib/seo'
import { BLOG_PAGE_SIZE, allTags, listPublishedPosts } from '@/lib/blog'
import { path } from '@/lib/paths'
import BlogCard from '@/components/store/BlogCard'

export const dynamic = 'force-dynamic'

type Search = { tag?: string | string[]; page?: string | string[] }
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'blog' })
  const tSeo = await getTranslations({ locale, namespace: 'seo' })
  const tStore = await getTranslations({ locale, namespace: 'store' })
  return pageMetadata({ locale, path: '/blog', title: `${t('title')} — ${tStore('name')}`, description: tSeo('blogDescription'), siteName: tStore('name') })
}

export default async function BlogIndexPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Search> }) {
  const { locale: raw } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  const sp = await searchParams
  const tag = first(sp.tag)?.trim().toLowerCase().slice(0, 40) || undefined
  const page = Math.max(1, Math.floor(Number(first(sp.page))) || 1)
  const t = await getTranslations({ locale, namespace: 'blog' })
  const [{ posts, total }, tags] = await Promise.all([listPublishedPosts({ locale, page, tag }), allTags()])
  const pages = Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE))

  const href = (o: { tag?: string; page?: number }) => {
    const q = new URLSearchParams()
    if (o.tag) q.set('tag', o.tag)
    if (o.page && o.page > 1) q.set('page', String(o.page))
    const s = q.toString()
    return `${path(locale, '/blog')}${s ? `?${s}` : ''}`
  }
  const chip = 'rounded-full px-3.5 py-1.5 text-sm font-medium transition'

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">{t('title')}</h1>
      <p className="mt-1 text-sm text-neutral-500">{t('subtitle')}</p>

      {tags.length > 0 && (
        <nav aria-label={t('tag')} className="mt-6 flex flex-wrap gap-2">
          <Link href={href({})} aria-current={!tag ? 'true' : undefined} className={`${chip} ${!tag ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}>
            {t('allTags')}
          </Link>
          {tags.map((x) => (
            <Link
              key={x}
              href={href({ tag: x })}
              aria-current={tag === x ? 'true' : undefined}
              className={`${chip} ${tag === x ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
            >
              {x}
            </Link>
          ))}
        </nav>
      )}

      {posts.length > 0 ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <BlogCard key={p.slug} post={p} locale={locale} />
          ))}
        </div>
      ) : (
        <p className="mt-8 rounded-2xl bg-neutral-50 px-6 py-12 text-center text-neutral-500">{t('empty')}</p>
      )}

      {pages > 1 && (
        <nav aria-label={t('page', { page, pages })} className="mt-10 flex items-center justify-center gap-4 text-sm">
          {page > 1 ? (
            <Link href={href({ tag, page: page - 1 })} rel="prev" className="rounded-full border border-neutral-300 px-4 py-2 font-semibold hover:bg-neutral-50">
              {t('prev')}
            </Link>
          ) : null}
          <span className="text-neutral-500">{t('page', { page, pages })}</span>
          {page < pages ? (
            <Link href={href({ tag, page: page + 1 })} rel="next" className="rounded-full border border-neutral-300 px-4 py-2 font-semibold hover:bg-neutral-50">
              {t('next')}
            </Link>
          ) : null}
        </nav>
      )}
    </div>
  )
}
