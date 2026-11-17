'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { path } from '@/lib/paths'
import LangSwitcher from '@/components/store/LangSwitcher'

/** Compact Mini App header: search + language (navigation lives in the bottom tab bar and Telegram's BackButton). */
export default function TgTopBar({ locale }: { locale: Locale }) {
  const t = useTranslations('nav')
  const router = useRouter()
  const [q, setQ] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const v = q.trim()
    router.push(`${path(locale, '/search')}${v ? `?q=${encodeURIComponent(v)}` : ''}`)
  }
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-2">
        <form onSubmit={submit} role="search" className="flex flex-1 items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2">
          <Search size={16} className="shrink-0 text-neutral-400" aria-hidden />
          <label htmlFor="tg-search" className="sr-only">
            {t('search')}
          </label>
          <input
            id="tg-search"
            type="search"
            enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
          />
        </form>
        <LangSwitcher locale={locale} />
      </div>
    </header>
  )
}
