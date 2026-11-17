import { notFound } from 'next/navigation'
import { mapLinks } from '@/lib/geo'
import { prisma } from '@/lib/db'
import { allowedTransitions } from '@/lib/admin/orders'
import { getRegion } from '@/lib/regions'
import { formatUzs } from '@/lib/money'
import { Badge, PageHeader, card, table, td, th } from '@/components/admin/ui'
import BackLink from '@/components/admin/BackLink'
import OrderStatusButtons from '@/components/admin/OrderStatusButtons'
import { requirePermission } from '@/lib/admin/session'

export const metadata = { title: 'Order' }

const TONE = { NEW: 'blue', CONFIRMED: 'amber', SHIPPING: 'violet', DELIVERED: 'green', CANCELLED: 'red' } as const

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('orders')
  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()
  const o = await prisma.order.findUnique({ where: { id }, include: { lines: { orderBy: { id: 'asc' } } } })
  if (!o) notFound()
  const region = getRegion(o.region)

  return (
    <>
      <BackLink href="/admin/orders">Orders</BackLink>
      <PageHeader title={`Order #${o.number}`} actions={<Badge tone={TONE[o.status as keyof typeof TONE] ?? 'neutral'}>{o.status}</Badge>} />

      <div className="grid gap-4 md:grid-cols-2">
        <section className={card} aria-labelledby="cust">
          <h2 id="cust" className="mb-3 text-base font-semibold text-neutral-900">
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
            {o.lat != null && o.lng != null && (
              <div className="flex gap-3">
                <dt className="w-24 shrink-0 text-neutral-500">Location</dt>
                <dd className="flex flex-wrap gap-3">
                  <a href={mapLinks(o.lat, o.lng).yandex} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 underline">
                    Yandex Maps
                  </a>
                  <a href={mapLinks(o.lat, o.lng).google} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 underline">
                    Google Maps
                  </a>
                  <span className="text-neutral-500">
                    {o.lat}, {o.lng}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className={card} aria-labelledby="status">
          <h2 id="status" className="mb-3 text-base font-semibold text-neutral-900">
            Status
          </h2>
          <OrderStatusButtons orderId={o.id} status={o.status} allowed={allowedTransitions(o.status)} />
          <p className="mt-3 text-xs text-neutral-500">Confirming takes the ordered quantities out of stock; cancelling a confirmed order puts them back.</p>
        </section>
      </div>

      <section className={`${card} mt-4 !p-0`} aria-labelledby="lines">
        <h2 id="lines" className="px-4 pb-3 pt-4 text-base font-semibold text-neutral-900 sm:px-5 sm:pt-5">
          Items
        </h2>
        <div className="overflow-x-auto">
        <table className={`${table} min-w-[520px]`}>
          <thead>
            <tr>
              <th className={`${th} sm:pl-5`}>Product</th>
              <th className={th}>SKU</th>
              <th className={`${th} text-right`}>Price</th>
              <th className={`${th} text-right`}>Qty</th>
              <th className={`${th} text-right sm:pr-5`}>Sum</th>
            </tr>
          </thead>
          <tbody>
            {o.lines.map((l) => (
              <tr key={l.id} className="hover:bg-neutral-50">
                <td className={`${td} sm:pl-5`}>
                  {l.productTitle}
                  {l.variantName ? <span className="text-neutral-500"> ({l.variantName})</span> : null}
                </td>
                <td className={`${td} font-mono text-xs`}>{l.sku}</td>
                <td className={`${td} text-right tabular-nums`}>
                  {formatUzs(l.priceUzs, 'en')}
                  {l.discountUzs > 0 && l.originalPriceUzs != null ? (
                    <div className="text-xs text-neutral-500">
                      <s>{formatUzs(l.originalPriceUzs, 'en')}</s> -{formatUzs(l.discountUzs, 'en')}
                      {l.promotionId != null ? ` (promotion #${l.promotionId})` : ''}
                    </div>
                  ) : null}
                </td>
                <td className={`${td} text-right tabular-nums`}>{l.qty}</td>
                <td className={`${td} text-right tabular-nums sm:pr-5`}>{formatUzs(l.priceUzs * l.qty, 'en')}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-neutral-900">
              <td colSpan={4} className="px-3 py-3 text-right">
                Total
              </td>
              <td className="px-3 py-3 text-right tabular-nums sm:pr-5">{formatUzs(o.totalUzs, 'en')}</td>
            </tr>
          </tfoot>
        </table>
        </div>
      </section>
    </>
  )
}
