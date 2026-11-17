import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { allowedTransitions } from '@/lib/admin/orders'
import { getRegion } from '@/lib/regions'
import { formatUzs } from '@/lib/money'
import { Badge, PageTitle, card } from '@/components/admin/ui'
import OrderStatusButtons from '@/components/admin/OrderStatusButtons'
import { requirePermission } from '@/lib/admin/session'

export const metadata = { title: 'Order' }

const TONE = { NEW: 'blue', CONFIRMED: 'amber', DELIVERED: 'green', CANCELLED: 'red' } as const

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('orders')
  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()
  const o = await prisma.order.findUnique({ where: { id }, include: { lines: { orderBy: { id: 'asc' } } } })
  if (!o) notFound()
  const region = getRegion(o.region)

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/orders" className="text-neutral-500 underline">
          Orders
        </Link>
      </p>
      <PageTitle actions={<Badge tone={TONE[o.status as keyof typeof TONE] ?? 'neutral'}>{o.status}</Badge>}>Order #{o.number}</PageTitle>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={card} aria-labelledby="cust">
          <h2 id="cust" className="mb-3 font-bold">
            Customer
          </h2>
          <dl className="space-y-2 text-sm">
            {[
              ['Name', o.name],
              ['Phone', o.phone],
              ['Region', region?.name.en ?? o.region],
              ['Address', o.address],
              ['Comment', o.comment || '-'],
              ['Language', o.locale.toUpperCase()],
              ['Placed', `${o.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`],
              ['Payment', `${o.paymentStatus}${o.paymentProvider ? ` (${o.paymentProvider})` : ''}`],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-24 shrink-0 text-neutral-500">{k}</dt>
                <dd className="min-w-0 break-words text-neutral-900">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={card} aria-labelledby="status">
          <h2 id="status" className="mb-3 font-bold">
            Status
          </h2>
          <OrderStatusButtons orderId={o.id} status={o.status} allowed={allowedTransitions(o.status)} />
          <p className="mt-3 text-xs text-neutral-500">Confirming takes the ordered quantities out of stock; cancelling a confirmed order puts them back.</p>
        </section>
      </div>

      <section className={`${card} mt-4 overflow-x-auto`} aria-labelledby="lines">
        <h2 id="lines" className="mb-3 font-bold">
          Items
        </h2>
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-xs uppercase text-neutral-500">
            <tr>
              <th className="pb-2">Product</th>
              <th className="pb-2">SKU</th>
              <th className="pb-2 text-right">Price</th>
              <th className="pb-2 text-right">Qty</th>
              <th className="pb-2 text-right">Sum</th>
            </tr>
          </thead>
          <tbody>
            {o.lines.map((l) => (
              <tr key={l.id} className="border-t border-neutral-100">
                <td className="py-2">
                  {l.productTitle}
                  {l.variantName ? <span className="text-neutral-500"> ({l.variantName})</span> : null}
                </td>
                <td className="py-2 font-mono text-xs">{l.sku}</td>
                <td className="py-2 text-right">{formatUzs(l.priceUzs, 'en')}</td>
                <td className="py-2 text-right">{l.qty}</td>
                <td className="py-2 text-right">{formatUzs(l.priceUzs * l.qty, 'en')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-300 font-bold">
              <td colSpan={4} className="pt-3 text-right">
                Total
              </td>
              <td className="pt-3 text-right">{formatUzs(o.totalUzs, 'en')}</td>
            </tr>
          </tfoot>
        </table>
      </section>
    </>
  )
}
