import Link from 'next/link'
import { requirePermission } from '@/lib/admin/session'
import { listPosts, type PostState } from '@/lib/admin/blog'
import { toTashkentLocal } from '@/lib/admin/promotions'
import { Badge, PageTitle, btn, btnGhost, card, input } from '@/components/admin/ui'

export const metadata = { title: 'Blog' }

type Search = { q?: string; status?: string }

const TONE: Record<PostState, 'green' | 'blue' | 'amber'> = { published: 'green', scheduled: 'blue', draft: 'amber' }
const LABEL: Record<PostState, string> = { published: 'Published', scheduled: 'Scheduled', draft: 'Draft' }
const when = (d: Date | null) => (d ? toTashkentLocal(d)!.replace('T', ' ') : '-')
const fieldLabel = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500'

export default async function BlogPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('blog')
  const sp = await searchParams
  const q = (sp.q ?? '').trim().slice(0, 100)
  const status = sp.status === 'DRAFT' || sp.status === 'PUBLISHED' ? sp.status : ''
  const rows = await listPosts({ q, status })
  return (
    <>
      <PageTitle
        actions={
          <Link href="/admin/blog/new" className={btn}>
            New post
          </Link>
        }
      >
        Blog
      </PageTitle>

      <form method="get" className={`${card} mb-4 flex flex-wrap items-end gap-3`}>
        <label className="min-w-[12rem] flex-1">
          <span className={fieldLabel}>Search</span>
          <input className={input} name="q" defaultValue={q} placeholder="Title or slug" />
        </label>
        <label>
          <span className={fieldLabel}>Status</span>
          <select className={input} name="status" defaultValue={status}>
            <option value="">All</option>
            <option value="PUBLISHED">Published (incl. scheduled)</option>
            <option value="DRAFT">Draft</option>
          </select>
        </label>
        <button type="submit" className={btn}>
          Filter
        </button>
        {q || status ? (
          <Link href="/admin/blog" className={btnGhost}>
            Reset
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <div className={`${card} text-sm text-neutral-500`}>{q || status ? 'No posts match.' : 'No posts yet.'}</div>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr>
                <th className="pb-2">Title</th>
                <th className="pb-2">State</th>
                <th className="pb-2">Publish date (Tashkent)</th>
                <th className="pb-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100 align-top">
                  <td className="py-2 pr-3">
                    <Link href={`/admin/blog/${p.id}`} className="font-semibold text-neutral-900 underline-offset-2 hover:underline">
                      {p.title}
                    </Link>
                    <div className="text-xs text-neutral-500">/{p.slug}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={TONE[p.state]}>{LABEL[p.state]}</Badge>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-xs text-neutral-600">{when(p.publishedAt)}</td>
                  <td className="whitespace-nowrap py-2 text-xs text-neutral-600">{when(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
