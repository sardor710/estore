import { requirePermission } from '@/lib/admin/session'
import { PageHeader } from '@/components/admin/ui'
import BackLink from '@/components/admin/BackLink'
import BlogEditor from '@/components/admin/BlogEditor'

export const metadata = { title: 'New post' }

export default async function NewPostPage() {
  await requirePermission('blog')
  return (
    <>
      <BackLink href="/admin/blog">Blog</BackLink>
      <PageHeader title="New post" />
      <BlogEditor postId={null} initial={null} />
    </>
  )
}
