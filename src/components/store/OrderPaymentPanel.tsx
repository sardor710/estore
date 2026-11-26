'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CheckCircle2, Clock, CreditCard, RotateCcw, XCircle } from 'lucide-react'
import type { OrderPaymentView } from '@/lib/payments/view'

/** Card payment state of an order, with "Pay now" / "Try again" that opens a fresh Octo payment page. */
export default function OrderPaymentPanel({ view }: { view: OrderPaymentView }) {
  const t = useTranslations('order.payment')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pay = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/payments/octo/pay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ number: view.number, token: view.token }),
      })
      const data = (await res.json().catch(() => ({}))) as { payUrl?: string; error?: string }
      if (res.ok && data.payUrl) {
        window.location.assign(data.payUrl)
        return
      }
      if (data.error === 'ALREADY_PAID') {
        window.location.reload()
        return
      }
      setError(t('error'))
    } catch {
      setError(t('error'))
    }
    setBusy(false)
  }

  const box = 'mt-6 rounded-2xl px-5 py-4 text-left text-sm'
  if (view.status === 'PAID') {
    return (
      <div className={`${box} bg-emerald-50 text-emerald-900`} role="status">
        <p className="flex items-center gap-2 font-semibold">
          <CheckCircle2 size={18} aria-hidden /> {t('paid')}
        </p>
        {(view.cardVendor || view.maskedPan) && (
          <p className="mt-1 flex items-center gap-2 text-emerald-800">
            <CreditCard size={15} aria-hidden /> {[view.cardVendor, view.maskedPan].filter(Boolean).join(' ')}
          </p>
        )}
      </div>
    )
  }
  if (view.status === 'REFUNDED') {
    return (
      <div className={`${box} bg-neutral-100 text-neutral-800`} role="status">
        <p className="flex items-center gap-2 font-semibold">
          <RotateCcw size={18} aria-hidden /> {t('refunded')}
        </p>
      </div>
    )
  }
  if (view.orderStatus === 'CANCELLED' || view.orderStatus === 'DELIVERED') return null
  const failed = view.status === 'FAILED'
  return (
    <div className={`${box} ${failed ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'}`} role="status">
      <p className="flex items-center gap-2 font-semibold">
        {failed ? <XCircle size={18} aria-hidden /> : <Clock size={18} aria-hidden />} {failed ? t('failed') : t('pending')}
      </p>
      <p className="mt-1">{failed ? t('failedHint') : t('pendingHint')}</p>
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className="mt-3 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:bg-neutral-300"
      >
        {busy ? t('opening') : failed ? t('tryAgain') : t('payNow')}
      </button>
      {error && <p className="mt-2 text-red-700">{error}</p>}
    </div>
  )
}
