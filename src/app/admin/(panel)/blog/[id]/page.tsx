import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/admin/session'
import { loadPostInput } from '@/lib/admin/blog'
import { PageHeader } from '@/components/admin/ui'
import BackLink from '@/components/admin/BackLink'
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
      <BackLink href="/admin/blog">Blog</BackLink>
      <PageHeader title={post.title.en || post.title.uz || post.title.ru || post.slug} />
      <BlogEditor key={id} postId={id} initial={post} />
    </>
  )
}
