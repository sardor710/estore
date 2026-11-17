'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setOrderStatusAction } from '@/app/admin/actions'
import { btn, btnDanger, btnGhost, Notice } from './ui'

const ERRORS: Record<string, string> = {
  INSUFFICIENT_STOCK: 'Not enough stock for one or more items. Adjust the stock in Products first, then confirm again.',
  BAD_TRANSITION: 'This status change is not allowed (the order may have been changed elsewhere). Reload the page.',
  BAD_REQUEST: 'Invalid request.',
}

const LABEL: Record<string, string> = { CONFIRMED: 'Confirm order', SHIPPING: 'Out for delivery', DELIVERED: 'Mark delivered', CANCELLED: 'Cancel order' }

export default function OrderStatusButtons({ orderId, status, allowed }: { orderId: number; status: string; allowed: string[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function go(to: string) {
    if (to === 'CANCELLED' && !window.confirm(status === 'CONFIRMED' || status === 'SHIPPING' ? 'Cancel this order and return the stock?' : 'Cancel this order?')) return
    setError(null)
    start(async () => {
      const r = await setOrderStatusAction(orderId, to)
      if (!r.ok) setError(ERRORS[r.error] ?? r.error)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-600">
        Current: <strong>{status}</strong>
      </div>
      {allowed.length === 0 ? (
        <p className="text-sm text-neutral-500">This order is final; no further changes.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {allowed.map((to) => (
            <button key={to} type="button" disabled={pending} onClick={() => go(to)} className={to === 'CANCELLED' ? btnDanger : to === 'CONFIRMED' ? btn : btnGhost}>
              {LABEL[to] ?? to}
            </button>
          ))}
        </div>
      )}
      {error ? <Notice kind="error">{error}</Notice> : null}
    </div>
  )
}
