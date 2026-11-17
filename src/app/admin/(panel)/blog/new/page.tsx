import Link from 'next/link'
import { requirePermission } from '@/lib/admin/session'
import { PageTitle } from '@/components/admin/ui'
import BlogEditor from '@/components/admin/BlogEditor'

export const metadata = { title: 'New post' }

export default async function NewPostPage() {
  await requirePermission('blog')
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/blog" className="text-neutral-500 underline">
          Blog
        </Link>
      </p>
      <PageTitle>New post</PageTitle>
      <BlogEditor postId={null} initial={null} />
    </>
  )
}
