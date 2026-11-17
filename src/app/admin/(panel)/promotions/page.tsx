import Link from 'next/link'
import { requirePermission } from '@/lib/admin/session'
import { listPromotions, toTashkentLocal, type PromoState } from '@/lib/admin/promotions'
import { Plus, TicketPercent } from 'lucide-react'
import { Badge, EmptyState, PageHeader, btn, card, table, td, th } from '@/components/admin/ui'
import { PromotionSwitch } from '@/components/admin/PromotionEditor'

export const metadata = { title: 'Promotions' }

const TONE: Record<PromoState, 'green' | 'blue' | 'neutral' | 'amber'> = { active: 'green', scheduled: 'blue', expired: 'neutral', off: 'amber' }
const spaced = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const when = (d: Date | null) => (d ? toTashkentLocal(d)!.replace('T', ' ') : null)

export default async function PromotionsPage() {
  await requirePermission('promotions')
  const rows = await listPromotions()
  return (
    <>
      <PageHeader
        title="Promotions"
        description={<>The single best active promotion applies to each product (they never stack), and no price goes below 1 000 so&apos;m. Dates are Tashkent time.</>}
        actions={
          <Link href="/admin/promotions/new" className={btn}>
            <Plus size={16} aria-hidden />
            New promotion
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={TicketPercent}
          title="No promotions yet."
          action={
            <Link href="/admin/promotions/new" className={btn}>
              <Plus size={16} aria-hidden />
              New promotion
            </Link>
          }
        />
      ) : (
        <div className={`${card} overflow-x-auto !p-0`}>
          <table className={`${table} min-w-[720px]`}>
            <thead>
              <tr>
                <th className={`${th} sm:pl-5`}>Name</th>
                <th className={th}>Applies to</th>
                <th className={th}>Discount</th>
                <th className={th}>Dates</th>
                <th className={th}>State</th>
                <th className={`${th} sm:pr-5`}>On</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-neutral-50">
                  <td className={`${td} sm:pl-5`}>
                    <Link href={`/admin/promotions/${p.id}`} className="font-semibold text-neutral-900 underline-offset-2 hover:text-indigo-700 hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className={`${td} text-neutral-700`}>{p.targetSummary}</td>
                  <td className={`${td} whitespace-nowrap font-semibold tabular-nums`}>{p.kind === 'PERCENT' ? `-${p.value}%` : `-${spaced(p.value)} so'm`}</td>
                  <td className={`${td} whitespace-nowrap text-xs text-neutral-600`}>
                    {when(p.startsAt) ?? 'now'} &rarr; {when(p.endsAt) ?? 'no end'}
                  </td>
                  <td className={td}>
                    <Badge tone={TONE[p.state]}>{p.state}</Badge>
                  </td>
                  <td className={`${td} sm:pr-5`}>
                    <PromotionSwitch id={p.id} name={p.name} enabled={p.enabled} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
