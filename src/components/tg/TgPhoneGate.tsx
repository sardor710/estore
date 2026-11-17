'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Phone } from 'lucide-react'
import { useWebApp } from './useTg'

const POLL_MS = 1500
const POLL_FOR_MS = 10_000

type State = 'idle' | 'waiting' | 'declined' | 'failed' | 'unavailable'

/**
 * Mini App phone step: Telegram's requestContact() sends the user's own contact to the bot, which links the account
 * (tokenless path in src/lib/account/login.ts). We then re-run the Mini App sign-in until the session appears.
 * `next`: where to go once signed in (null = reload the current page).
 */
export default function TgPhoneGate({ next = null }: { next?: string | null }) {
  const t = useTranslations('tg.phone')
  const app = useWebApp()
  const [state, setState] = useState<State>('idle')

  const pollSession = async (): Promise<boolean> => {
    const until = Date.now() + POLL_FOR_MS
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, POLL_MS))
      try {
        const res = await fetch('/api/tg/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ initData: app?.initData ?? '' }),
        })
        if (res.ok && ((await res.json()) as { signedIn?: boolean }).signedIn) return true
      } catch {
        // keep polling until the deadline
      }
    }
    return false
  }

  const share = () => {
    if (!app?.requestContact || !app.isVersionAtLeast('6.9')) return setState('unavailable')
    setState('waiting')
    app.requestContact(async (shared) => {
      if (!shared) return setState('declined')
      if (await pollSession()) {
        app.HapticFeedback?.notificationOccurred('success')
        // full load: the server re-renders with the new session (header, checkout account, orders)
        if (next) window.location.replace(next)
        else window.location.reload()
      } else {
        setState('failed')
      }
    })
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#229ED9]/10 text-[#229ED9]">
        <Phone size={22} aria-hidden />
      </span>
      <h2 className="mt-3 text-lg font-bold text-neutral-900">{t('title')}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-600">{t('body')}</p>
      <button
        type="button"
        onClick={share}
        disabled={state === 'waiting'}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#229ED9] px-6 py-3 text-sm font-semibold text-white disabled:opacity-70"
      >
        {state === 'waiting' && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {state === 'waiting' ? t('waiting') : state === 'idle' ? t('button') : t('retry')}
      </button>
      {(state === 'declined' || state === 'failed' || state === 'unavailable') && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {t(state)}
        </p>
      )}
    </section>
  )
}
