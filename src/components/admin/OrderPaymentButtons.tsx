'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { btnDanger, btnGhost, Notice } from './ui'
import { formatUzs } from '@/lib/money'

/** "Check status" (ask Octo now) and "Refund" (full amount, PAID orders only) for a card order. */
export default function OrderPaymentButtons({ orderId, paymentStatus, amountUzs }: { orderId: number; paymentStatus: string; amountUzs: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  const post = (path: string) =>
    start(async () => {
      setMsg(null)
      try {
        const res = await fetch(`/api/admin/orders/${orderId}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
        const data = (await res.json().catch(() => ({}))) as { status?: string; paymentStatus?: string; error?: string; message?: string }
        if (!res.ok) setMsg({ kind: 'error', text: data.message || data.error || `Request failed (HTTP ${res.status})` })
        else if (path === 'refund') setMsg({ kind: 'ok', text: data.status === 'REFUND_PENDING' ? 'Refund requested; Octo is processing it.' : 'Refunded to the customer’s card.' })
        else setMsg({ kind: 'ok', text: `Octo says: ${data.paymentStatus}` })
      } catch {
        setMsg({ kind: 'error', text: 'Network error. Try again.' })
      }
      router.refresh()
    })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => post('payment-check')} className={btnGhost}>
          Check status
        </button>
        {paymentStatus === 'PAID' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => window.confirm(`Refund ${formatUzs(amountUzs, 'en')} to the customer's card? This cannot be undone.`) && post('refund')}
            className={btnDanger}
          >
            Refund
          </button>
        )}
      </div>
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
    </div>
  )
}
