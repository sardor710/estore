'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Info, X } from 'lucide-react'
import { useCartToast, type CartToastState } from '@/lib/cart/cartToast'
import { useCartDrawer } from '@/lib/cart/useCart'

const SHOW_MS = 3000

/** Bottom-center confirmation after adding to cart; "View cart" opens the drawer. Pauses while hovered/focused. */
export default function CartToast({ telegram = false }: { telegram?: boolean }) {
  const { toast, dismiss } = useCartToast()
  const { open: drawerOpen } = useCartDrawer()
  const dismissRef = useRef(dismiss)
  dismissRef.current = dismiss

  // the drawer is the full answer: no need for the toast once it is open
  useEffect(() => {
    if (drawerOpen) dismissRef.current()
  }, [drawerOpen])

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 ${
        telegram ? 'bottom-[calc(5rem+env(safe-area-inset-bottom))]' : 'bottom-6'
      }`}
    >
      {/* keyed by id: every new toast starts un-paused with a fresh timer (an unmounted toast fires no mouseleave/blur) */}
      {toast && <ToastBody key={toast.id} toast={toast} onDismiss={dismiss} />}
    </div>
  )
}

function ToastBody({ toast, onDismiss }: { toast: CartToastState; onDismiss: () => void }) {
  const t = useTranslations('cartToast')
  const { setOpen } = useCartDrawer()
  const [paused, setPaused] = useState(false)
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useEffect(() => {
    if (paused) return
    const id = setTimeout(() => dismissRef.current(), SHOW_MS)
    return () => clearTimeout(id)
  }, [paused])

  const text = toast.kind === 'addedMany' ? t('addedMany', { count: toast.count }) : t(toast.kind)
  const ok = toast.kind !== 'max'

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full bg-neutral-900 py-2 pl-4 pr-2 text-sm text-white shadow-xl motion-safe:animate-[fadeIn_.2s_ease-out]"
    >
      {ok ? <Check size={16} className="shrink-0 text-emerald-400" aria-hidden /> : <Info size={16} className="shrink-0 text-amber-300" aria-hidden />}
      <span className="min-w-0">{text}</span>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          onDismiss()
        }}
        className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-neutral-900 hover:bg-neutral-200"
      >
        {t('view')}
      </button>
      <button type="button" onClick={onDismiss} aria-label={t('close')} className="shrink-0 rounded-full p-1.5 text-neutral-400 hover:text-white">
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}
