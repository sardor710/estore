import Link from 'next/link'
import { History } from 'lucide-react'
import { requirePermission } from '@/lib/admin/session'
import { ACTIVITY_PAGE_SIZE, activityEntities, listActivity } from '@/lib/admin/activity'
import { listUsers } from '@/lib/admin/users'
import { Badge, EmptyState, PageHeader, Toolbar, btn, btnGhost, card, input, Label, table, td, th } from '@/components/admin/ui'

export const metadata = { title: 'Activity log' }

type Search = { user?: string; entity?: string; from?: string; to?: string; page?: string }

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', dateStyle: 'medium', timeStyle: 'medium' })
const ACTION_TONE: Record<string, 'neutral' | 'green' | 'amber' | 'red' | 'blue'> = {
  create: 'green',
  update: 'blue',
  delete: 'red',
  status: 'amber',
  login: 'neutral',
}
const sth = `${th} sticky top-0 z-10`
const day = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission('activity')
  const sp = await searchParams
  const userId = Number(sp.user)
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1)
  const filter = {
    userId: Number.isInteger(userId) && userId > 0 ? userId : undefined,
    entity: sp.entity || undefined,
    from: day(sp.from),
    to: day(sp.to),
  }
  const [{ rows, total }, users, entities] = await Promise.all([listActivity({ ...filter, page }), listUsers(), activityEntities()])
  const pages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE))

  const pageHref = (p: number) => {
    const q = new URLSearchParams()
    if (filter.userId) q.set('user', String(filter.userId))
    if (filter.entity) q.set('entity', filter.entity)
    if (filter.from) q.set('from', filter.from)
    if (filter.to) q.set('to', filter.to)
    if (p > 1) q.set('page', String(p))
    const s = q.toString()
    return s ? `/admin/activity?${s}` : '/admin/activity'
  }

  return (
    <>
      <PageHeader title="Activity log" />

      <Toolbar>
      <form method="get" className="grid w-full grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end">
        <label className="col-span-2 block sm:col-span-1">
          <Label>User</Label>
          <select name="user" defaultValue={filter.userId ? String(filter.userId) : ''} className={input}>
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 block sm:col-span-1">
          <Label>Entity</Label>
          <select name="entity" defaultValue={filter.entity ?? ''} className={input}>
            <option value="">Everything</option>
            {entities.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <Label hint="Tashkent">From</Label>
          <input type="date" name="from" defaultValue={filter.from ?? ''} className={input} />
        </label>
        <label className="block">
          <Label hint="inclusive">To</Label>
          <input type="date" name="to" defaultValue={filter.to ?? ''} className={input} />
        </label>
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <button type="submit" className={btnGhost}>
            Filter
          </button>
          <Link href="/admin/activity" className={btnGhost}>
            Reset
          </Link>
        </div>
      </form>
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState icon={History} title="No activity matches these filters." />
      ) : (
        <div className={`${card} overflow-auto !p-0 md:max-h-[calc(100dvh-18rem)]`}>
          <table className={`${table} min-w-[640px]`}>
            <thead>
              <tr>
                <th scope="col" className={`${sth} sm:pl-5`}>When</th>
                <th scope="col" className={sth}>Who</th>
                <th scope="col" className={sth}>Action</th>
                <th scope="col" className={`${sth} sm:pr-5`}>What</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-neutral-50">
                  <td className={`${td} whitespace-nowrap !align-top text-neutral-600 sm:pl-5`}>{fmt.format(r.createdAt)}</td>
                  <td className={`${td} !align-top text-neutral-900`}>{r.userEmail}</td>
                  <td className={`${td} !align-top`}>
                    <Badge tone={ACTION_TONE[r.action] ?? 'neutral'}>{r.action}</Badge>
                  </td>
                  <td className={`${td} !align-top sm:pr-5`}>
                    <span className="text-neutral-500">
                      {r.entity}
                      {r.entityId ? ` #${r.entityId}` : ''}:
                    </span>{' '}
                    {r.summary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-600">
        <span>
          {total} entr{total === 1 ? 'y' : 'ies'} · page {Math.min(page, pages)} of {pages}
        </span>
        <span className="flex gap-2">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={btnGhost}>
              Newer
            </Link>
          ) : null}
          {page < pages ? (
            <Link href={pageHref(page + 1)} className={btnGhost}>
              Older
            </Link>
          ) : null}
        </span>
      </nav>
    </>
  )
}
