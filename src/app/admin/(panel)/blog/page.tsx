import Link from 'next/link'
import { Newspaper, Plus } from 'lucide-react'
import { requirePermission } from '@/lib/admin/session'
import { listPosts, type PostState } from '@/lib/admin/blog'
import { toTashkentLocal } from '@/lib/admin/promotions'
import { Badge, EmptyState, Label, PageHeader, Toolbar, btn, btnGhost, card, input, table, td, th } from '@/components/admin/ui'

export const metadata = { title: 'Blog' }

type Search = { q?: string; status?: string }

const TONE: Record<PostState, 'green' | 'blue' | 'amber'> = { published: 'green', scheduled: 'blue', draft: 'amber' }
const LABEL: Record<PostState, string> = { published: 'Published', scheduled: 'Scheduled', draft: 'Draft' }
const when = (d: Date | null) => (d ? toTashkentLocal(d)!.replace('T', ' ') : '-')

export default async function BlogPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('blog')
  const sp = await searchParams
  const q = (sp.q ?? '').trim().slice(0, 100)
  const status = sp.status === 'DRAFT' || sp.status === 'PUBLISHED' ? sp.status : ''
  const rows = await listPosts({ q, status })
  return (
    <>
      <PageHeader
        title="Blog"
        actions={
          <Link href="/admin/blog/new" className={btn}>
            <Plus size={16} aria-hidden />
            New post
          </Link>
        }
      />

      <Toolbar>
      <form method="get" className="contents">
        <label className="min-w-[12rem] flex-1">
          <Label>Search</Label>
          <input className={input} name="q" defaultValue={q} placeholder="Title or slug" />
        </label>
        <label>
          <Label>Status</Label>
          <select className={input} name="status" defaultValue={status}>
            <option value="">All</option>
            <option value="PUBLISHED">Published (incl. scheduled)</option>
            <option value="DRAFT">Draft</option>
          </select>
        </label>
        <button type="submit" className={btnGhost}>
          Filter
        </button>
        {q || status ? (
          <Link href="/admin/blog" className={btnGhost}>
            Reset
          </Link>
        ) : null}
      </form>
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title={q || status ? 'No posts match.' : 'No posts yet.'}
          action={
            q || status ? undefined : (
              <Link href="/admin/blog/new" className={btn}>
                <Plus size={16} aria-hidden />
                New post
              </Link>
            )
          }
        />
      ) : (
        <div className={`${card} overflow-x-auto !p-0`}>
          <table className={`${table} min-w-[640px]`}>
            <thead>
              <tr>
                <th className={`${th} sm:pl-5`}>Title</th>
                <th className={th}>State</th>
                <th className={th}>Publish date (Tashkent)</th>
                <th className={`${th} sm:pr-5`}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-neutral-50">
                  <td className={`${td} sm:pl-5`}>
                    <Link href={`/admin/blog/${p.id}`} className="font-semibold text-neutral-900 underline-offset-2 hover:text-indigo-700 hover:underline">
                      {p.title}
                    </Link>
                    <div className="text-xs text-neutral-500">/{p.slug}</div>
                  </td>
                  <td className={td}>
                    <Badge tone={TONE[p.state]}>{LABEL[p.state]}</Badge>
                  </td>
                  <td className={`${td} whitespace-nowrap text-xs text-neutral-600`}>{when(p.publishedAt)}</td>
                  <td className={`${td} whitespace-nowrap text-xs text-neutral-600 sm:pr-5`}>{when(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
