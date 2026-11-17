import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { routing, type Locale } from '@/i18n/routing'
import { articleJsonLd, jsonLdScript, pageMetadata, postDescription } from '@/lib/seo'
import { getPublishedPost, getRelatedPosts } from '@/lib/blog'
import { formatPostDate } from '@/lib/blog-format'
import { t as l10n } from '@/lib/localized'
import { sanitizeHtml } from '@/lib/sanitize'
import { path } from '@/lib/paths'
import Breadcrumbs from '@/components/store/Breadcrumbs'
import BlogCard from '@/components/store/BlogCard'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const post = await getPublishedPost(slug)
  if (!post) return {}
  const tStore = await getTranslations({ locale, namespace: 'store' })
  return pageMetadata({
    locale,
    path: `/blog/${slug}`,
    title: `${l10n(post.seoTitle, locale) || l10n(post.title, locale)} — ${tStore('name')}`,
    description: postDescription(post, locale),
    siteName: tStore('name'),
    image: post.coverImage ?? undefined,
  })
}

export default async function BlogPostPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: raw, slug } = await params
  setRequestLocale(raw)
  const locale = raw as Locale
  const post = await getPublishedPost(slug)
  if (!post) notFound()
  const [t, related] = await Promise.all([getTranslations({ locale, namespace: 'blog' }), getRelatedPosts(post, locale, 3)])
  const title = l10n(post.title, locale)
  const html = sanitizeHtml(l10n(post.contentHtml, locale))

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(articleJsonLd(post, locale)) }} />
      <Breadcrumbs locale={locale} items={[{ label: t('title'), href: path(locale, '/blog') }, { label: title }]} />
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <header>
          <time dateTime={post.publishedAt.toISOString()} className="text-sm font-medium text-neutral-500">
            {formatPostDate(post.publishedAt, locale)}
          </time>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">{title}</h1>
          {post.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`${path(locale, '/blog')}?tag=${encodeURIComponent(tag)}`}
                  className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}
        </header>
        {post.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.coverImage} alt="" className="mt-8 aspect-[16/9] w-full rounded-2xl object-cover" />
        ) : null}
        <div className="rich-content mt-8" dangerouslySetInnerHTML={{ __html: html }} />
        <p className="mt-10">
          <Link href={path(locale, '/blog')} className="text-sm font-semibold text-neutral-900 underline-offset-2 hover:underline">
            &larr; {t('back')}
          </Link>
        </p>
      </article>
      {related.length > 0 && (
        <section aria-labelledby="related-h" className="mx-auto max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
          <h2 id="related-h" className="mb-6 text-2xl font-extrabold tracking-tight text-neutral-900">
            {t('related')}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <BlogCard key={p.slug} post={p} locale={locale} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
