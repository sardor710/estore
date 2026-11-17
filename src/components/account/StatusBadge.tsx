import { isOrderStatus, type OrderStatus } from './format'

const STYLE: Record<OrderStatus, string> = {
  NEW: 'bg-amber-50 text-amber-800 ring-amber-200',
  CONFIRMED: 'bg-sky-50 text-sky-800 ring-sky-200',
  SHIPPING: 'bg-violet-50 text-violet-800 ring-violet-200',
  DELIVERED: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  CANCELLED: 'bg-neutral-100 text-neutral-600 ring-neutral-200',
}

/** Order status pill. `label` is the localized status text (account.statuses.*). */
export default function StatusBadge({ status, label }: { status: string; label: string }) {
  const cls = isOrderStatus(status) ? STYLE[status] : STYLE.CANCELLED
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${cls}`}>{label}</span>
  )
}
