import Link from 'next/link'
import { requirePermission } from '@/lib/admin/session'
import { listPromotions, toTashkentLocal, type PromoState } from '@/lib/admin/promotions'
import { Badge, PageTitle, btn, card } from '@/components/admin/ui'
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
      <PageTitle
        actions={
          <Link href="/admin/promotions/new" className={btn}>
            New promotion
          </Link>
        }
      >
        Promotions
      </PageTitle>
      <p className="mb-4 text-sm text-neutral-600">
        The single best active promotion applies to each product (they never stack), and no price goes below 1 000 so&apos;m. Dates are Tashkent time.
      </p>
      {rows.length === 0 ? (
        <div className={`${card} text-sm text-neutral-500`}>No promotions yet.</div>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr>
                <th className="pb-2">Name</th>
                <th className="pb-2">Applies to</th>
                <th className="pb-2">Discount</th>
                <th className="pb-2">Dates</th>
                <th className="pb-2">State</th>
                <th className="pb-2">On</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100 align-top">
                  <td className="py-2 pr-3">
                    <Link href={`/admin/promotions/${p.id}`} className="font-semibold text-neutral-900 underline-offset-2 hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-neutral-700">{p.targetSummary}</td>
                  <td className="whitespace-nowrap py-2 pr-3 font-semibold">{p.kind === 'PERCENT' ? `-${p.value}%` : `-${spaced(p.value)} so'm`}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-xs text-neutral-600">
                    {when(p.startsAt) ?? 'now'} &rarr; {when(p.endsAt) ?? 'no end'}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={TONE[p.state]}>{p.state}</Badge>
                  </td>
                  <td className="py-2">
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
