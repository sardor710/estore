import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/admin/session'
import { loadPostInput } from '@/lib/admin/blog'
import { PageTitle } from '@/components/admin/ui'
import BlogEditor from '@/components/admin/BlogEditor'

export const metadata = { title: 'Edit post' }

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('blog')
  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()
  const post = await loadPostInput(id)
  if (!post) notFound()
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/blog" className="text-neutral-500 underline">
          Blog
        </Link>
      </p>
      <PageTitle>{post.title.en || post.title.uz || post.title.ru || post.slug}</PageTitle>
      <BlogEditor key={id} postId={id} initial={post} />
    </>
  )
}
