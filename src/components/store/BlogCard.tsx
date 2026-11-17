import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/routing'
import type { PostCard } from '@/lib/blog'
import { formatPostDate } from '@/lib/blog-format'
import { path } from '@/lib/paths'

export default async function BlogCard({ post, locale }: { post: PostCard; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'blog' })
  const href = path(locale, `/blog/${post.slug}`)
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition hover:shadow-md">
      <Link href={href} tabIndex={-1} aria-hidden className="block aspect-[16/9] overflow-hidden bg-neutral-100">
        {post.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.coverImage} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <time dateTime={post.publishedAt.toISOString()} className="text-xs font-medium text-neutral-500">
          {formatPostDate(post.publishedAt, locale)}
        </time>
        <h2 className="mt-2 text-lg font-bold leading-snug text-neutral-900">
          <Link href={href} className="hover:underline">
            {post.title}
          </Link>
        </h2>
        {post.excerpt ? <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-neutral-600">{post.excerpt}</p> : null}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
          <div className="flex flex-wrap gap-1.5">
            {post.tags.slice(0, 3).map((tag) => (
              <Link
                key={tag}
                href={`${path(locale, '/blog')}?tag=${encodeURIComponent(tag)}`}
                aria-label={`${t('tag')}: ${tag}`}
                className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
              >
                {tag}
              </Link>
            ))}
          </div>
          <Link href={href} className="text-sm font-semibold text-neutral-900 underline-offset-2 hover:underline">
            {t('readMore')}
          </Link>
        </div>
      </div>
    </article>
  )
}
