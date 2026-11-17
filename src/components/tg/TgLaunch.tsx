'use client'

import { useEffect, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { loadWebApp } from './webapp'

type Lang = 'uz' | 'ru' | 'en'
// This page has no next-intl provider (it runs before the locale is known), so its few strings live here.
const COPY: Record<Lang, { loading: string; outside: string; open: string; error: string; retry: string }> = {
  uz: {
    loading: 'Do‘kon ochilmoqda…',
    outside: 'Bu sahifa do‘konning Telegram boti ichida ochiladi.',
    open: 'Botni ochish',
    error: 'Do‘konni ochib bo‘lmadi. Qayta urinib ko‘ring.',
    retry: 'Qayta urinish',
  },
  ru: {
    loading: 'Открываем магазин…',
    outside: 'Эта страница открывается внутри Telegram-бота магазина.',
    open: 'Открыть бота',
    error: 'Не удалось открыть магазин. Попробуйте ещё раз.',
    retry: 'Повторить',
  },
  en: {
    loading: 'Opening the shop…',
    outside: 'This page opens inside the shop’s Telegram bot.',
    open: 'Open the bot',
    error: 'Could not open the shop. Please try again.',
    retry: 'Try again',
  },
}

function browserLang(): Lang {
  const l = (typeof navigator !== 'undefined' ? navigator.language : '').slice(0, 2)
  return l === 'ru' || l === 'en' ? l : 'uz'
}

type State = { s: 'loading' } | { s: 'outside' } | { s: 'error' }

export default function TgLaunch({ next, botUsername }: { next: string | null; botUsername: string | null }) {
  const [state, setState] = useState<State>({ s: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [lang, setLang] = useState<Lang>('uz')

  useEffect(() => {
    setLang(browserLang())
    let cancelled = false
    ;(async () => {
      const app = await loadWebApp()
      if (cancelled) return
      if (!app) return setState({ s: 'outside' })
      app.ready()
      app.expand()
      try {
        const res = await fetch('/api/tg/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ initData: app.initData, next }),
        })
        if (cancelled) return
        if (res.status === 401) return setState({ s: 'outside' })
        if (!res.ok) return setState({ s: 'error' })
        const r = (await res.json()) as { next: string }
        window.location.replace(r.next) // full load: the server renders the Telegram-mode shell from the new cookies
      } catch {
        if (!cancelled) setState({ s: 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [next, attempt])

  const c = COPY[lang]
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      {state.s === 'loading' && (
        <>
          <Loader2 className="size-8 animate-spin text-neutral-400" aria-hidden />
          <p className="text-sm text-neutral-500">{c.loading}</p>
        </>
      )}
      {state.s === 'outside' && (
        <>
          <p className="max-w-xs text-base text-neutral-700">{c.outside}</p>
          {botUsername && (
            <a
              href={`https://t.me/${botUsername}`}
              className="inline-flex items-center gap-2 rounded-full bg-[#229ED9] px-5 py-2.5 text-sm font-semibold text-white"
            >
              <Send className="size-4" aria-hidden /> {c.open}
            </a>
          )}
        </>
      )}
      {state.s === 'error' && (
        <>
          <p className="max-w-xs text-base text-neutral-700">{c.error}</p>
          <button
            type="button"
            onClick={() => {
              setState({ s: 'loading' })
              setAttempt((n) => n + 1)
            }}
            className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white"
          >
            {c.retry}
          </button>
        </>
      )}
    </main>
  )
}
