import { notFound } from 'next/navigation'
import { mapLinks } from '@/lib/geo'
import { prisma } from '@/lib/db'
import { allowedTransitions } from '@/lib/admin/orders'
import { getRegion } from '@/lib/regions'
import { formatUzs } from '@/lib/money'
import { Badge, Notice, PageHeader, card, table, td, th } from '@/components/admin/ui'
import BackLink from '@/components/admin/BackLink'
import OrderStatusButtons from '@/components/admin/OrderStatusButtons'
import OrderPaymentButtons from '@/components/admin/OrderPaymentButtons'
import { settleOrder } from '@/lib/payments/service'
import { livePaymentDeps } from '@/lib/payments/live'
import { requirePermission } from '@/lib/admin/session'

export const metadata = { title: 'Order' }

const TONE = { NEW: 'blue', CONFIRMED: 'amber', SHIPPING: 'violet', DELIVERED: 'green', CANCELLED: 'red' } as const

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('orders')
  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()
  // A card order still waiting is re-checked with Octo first, so admin sees the real payment state.
  await settleOrder(id, livePaymentDeps).catch(() => {})
  const o = await prisma.order.findUnique({ where: { id }, include: { lines: { orderBy: { id: 'asc' } }, payments: { orderBy: { id: 'desc' } } } })
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

      {(() => {
        const paid = o.payments.find((p) => p.status === 'succeeded')
        const last = paid ?? o.payments[0]
        const PAY_TONE = { PAID: 'green', PENDING: 'amber', FAILED: 'red', REFUNDED: 'neutral', UNPAID: 'neutral' } as const
        return (
          <section className={`${card} mt-4`} aria-labelledby="payment">
            <h2 id="payment" className="mb-3 flex items-center gap-2 text-base font-semibold text-neutral-900">
              Payment <Badge tone={PAY_TONE[o.paymentStatus as keyof typeof PAY_TONE] ?? 'neutral'}>{o.payMethod === 'CARD' ? o.paymentStatus : 'CASH ON DELIVERY'}</Badge>
            </h2>
            {o.payMethod !== 'CARD' ? (
              <p className="text-sm text-neutral-600">The customer pays the courier on delivery.</p>
            ) : (
              <>
                <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
                  {[
                    ['Method', 'Card online (Octo)'],
                    ['Amount', formatUzs(o.totalUzs, 'en')],
                    ['Card', paid ? [paid.cardVendor, paid.maskedPan].filter(Boolean).join(' ') || '-' : '-'],
                    ['Paid at', paid?.paidAt ? `${paid.paidAt.toISOString().slice(0, 16).replace('T', ' ')} UTC` : '-'],
                    ['Octo payment', last?.octoPaymentId ?? '-'],
                    ['Attempts', String(o.payments.length)],
                    ...(paid && paid.refundedUzs > 0 ? [['Refunded', formatUzs(paid.refundedUzs, 'en')]] : []),
                    ...(paid?.refundId && paid.refundedUzs === 0 ? [['Refund', `pending (${paid.refundId})`]] : []),
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-3">
                      <dt className="w-28 shrink-0 text-neutral-500">{k}</dt>
                      <dd className="min-w-0 break-all text-neutral-900">{v}</dd>
                    </div>
                  ))}
                </dl>
                {o.paymentStatus === 'PAID' && o.status === 'CANCELLED' && (
                  <div className="mb-3">
                    <Notice kind="error">This order is cancelled but was paid by card. Refund the payment.</Notice>
                  </div>
                )}
                {o.payments.filter((p) => p.status === 'succeeded').length > 1 && (
                  <div className="mb-3">
                    <Notice kind="error">This order was paid more than once. Refund the extra payment in the Octo cabinet.</Notice>
                  </div>
                )}
                <OrderPaymentButtons orderId={o.id} paymentStatus={o.paymentStatus} amountUzs={o.totalUzs} />
                {o.payments.length > 0 && (
                  <ul className="mt-4 space-y-1 border-t border-neutral-100 pt-3 text-xs text-neutral-600">
                    {o.payments.map((p) => (
                      <li key={p.id} className="flex flex-wrap gap-x-3">
                        <span className="font-mono">{p.shopTransactionId}</span>
                        <span className="font-semibold">{p.status}</span>
                        {p.test && <span className="font-semibold text-amber-700">TEST</span>}
                        <span>{p.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        )
      })()}

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
