import { Megaphone } from 'lucide-react'
import { requirePermission } from '@/lib/admin/session'
import { broadcastAudience, listBroadcasts } from '@/lib/customer-messages'
import { Badge, EmptyState, PageHeader, card } from '@/components/admin/ui'
import MessageComposer from '@/components/admin/MessageComposer'
import MessageMedia from '@/components/MessageMedia'

export const metadata = { title: 'Messages' }
export const dynamic = 'force-dynamic'

const when = (d: Date) => d.toLocaleString('en-GB', { timeZone: 'Asia/Tashkent', dateStyle: 'medium', timeStyle: 'short' })

export default async function MessagesPage() {
  await requirePermission('clients')
  const [audience, broadcasts] = await Promise.all([broadcastAudience(), listBroadcasts()])

  return (
    <>
      <PageHeader
        title="Messages"
        description="Send a post (text, photo or video) to all customers with an account. They get it in the Telegram bot and in their account (Messages). To message one customer, open them under Clients."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className={card}>
          <h2 className="mb-3 text-base font-semibold text-neutral-900">New post</h2>
          <MessageComposer mode="broadcast" accounts={audience.accounts} telegram={audience.telegram} />
        </div>
        <div className={card}>
          <h2 className="mb-3 text-base font-semibold text-neutral-900">Sent posts</h2>
          {broadcasts.length === 0 ? (
            <EmptyState icon={Megaphone} title="No posts yet." />
          ) : (
            <ul className="divide-y divide-neutral-100">
              {broadcasts.map((b) => (
                <li key={b.id} className="py-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                    <span>{when(b.createdAt)}</span>
                    <span>· {b.createdBy}</span>
                  </div>
                  <MessageMedia url={b.mediaUrl} kind={b.mediaKind} className="mb-2 max-h-48" />
                  {b.text ? <p className="whitespace-pre-line break-words text-sm text-neutral-900">{b.text}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge>{b.recipients} recipients</Badge>
                    <Badge tone="green">Telegram sent {b.sent}</Badge>
                    {b.pending ? <Badge tone="amber">Sending {b.pending}</Badge> : null}
                    {b.failed ? <Badge tone="red">Failed {b.failed}</Badge> : null}
                    {b.skipped ? <Badge>Site only {b.skipped}</Badge> : null}
                    <Badge tone="accent">Read on site {b.read}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
