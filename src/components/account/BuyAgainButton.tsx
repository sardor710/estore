'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Loader2, RotateCcw } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { useCart } from '@/lib/cart/useCart'
import { flyToCart } from '@/lib/cart/flyToCart'
import { showCartToast } from '@/lib/cart/cartToast'
import { buyAgainAction } from '@/app/[locale]/account/actions'
import { loginHref } from './signOut'

type Result = { kind: 'ok'; added: number; unavailable: string[] } | { kind: 'error' }

/** Re-adds the order's still-available variants (stock-capped by the server) to the cart; flies to the cart icon and toasts. */
export default function BuyAgainButton({ orderNumber, locale }: { orderNumber: number; locale: Locale }) {
  const t = useTranslations('account.order')
  const router = useRouter()
  const { add } = useCart()
  const button = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const run = async () => {
    setBusy(true)
    setResult(null)
    try {
      const r = await buyAgainAction(orderNumber)
      if (!r.ok) {
        if (r.error === 'AUTH') {
          router.push(loginHref(locale))
          return
        }
        setResult({ kind: 'error' })
      } else {
        // Capped by current stock: a line already in the cart (or a second click) can't exceed what's available.
        let changed = 0
        for (const l of r.lines) if (add(l.variantId, l.qty, l.stock)) changed++
        if (changed > 0) {
          if (button.current) void flyToCart({ from: button.current })
          showCartToast({ kind: 'addedMany', count: changed })
        } else if (r.lines.length > 0) showCartToast({ kind: 'max' })
        setResult({ kind: 'ok', added: r.lines.length, unavailable: r.unavailable })
      }
    } catch {
      setResult({ kind: 'error' })
    }
    setBusy(false)
  }

  return (
    <div>
      <button
        ref={button}
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-wait disabled:bg-neutral-500"
      >
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <RotateCcw size={16} aria-hidden />}
        {busy ? t('adding') : t('buyAgain')}
      </button>
      <div role="status" aria-live="polite">
        {result?.kind === 'error' && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('buyError')}</p>}
        {result?.kind === 'ok' && (result.added > 0 || result.unavailable.length > 0) && (
          <div className={`mt-3 rounded-xl px-4 py-3 text-sm ${result.unavailable.length ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`}>
            {result.added > 0 ? <p>{t('added')}</p> : <p>{t('nothingAvailable')}</p>}
            {result.unavailable.length > 0 && (
              <>
                <p className="mt-2 font-semibold">{t('unavailable')}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {result.unavailable.map((u, i) => (
                    <li key={`${u}-${i}`}>{u}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
