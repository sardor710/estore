'use client'

import type { Locale } from '@/i18n/routing'
import LangSwitcher from '@/components/store/LangSwitcher'
import SearchBox from '@/components/store/SearchBox'

/** Compact Mini App header: search + language (navigation lives in the bottom tab bar and Telegram's BackButton). */
export default function TgTopBar({ locale }: { locale: Locale }) {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-2">
        <SearchBox locale={locale} id="tg-search" align="left" className="flex-1" />
        <LangSwitcher locale={locale} />
      </div>
    </header>
  )
}
