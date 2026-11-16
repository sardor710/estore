'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { path } from '@/lib/paths'

// Gradient-only slides: no third-party store images are hotlinked.
type Slide = { key: 'chargers' | 'powerBanks' | 'audio'; slug: string; gradient: string }

const SLIDES: Slide[] = [
  { key: 'chargers', slug: 'chargers', gradient: 'from-neutral-950 via-neutral-900 to-neutral-800' },
  { key: 'powerBanks', slug: 'power-banks', gradient: 'from-neutral-950 via-neutral-900 to-slate-800' },
  { key: 'audio', slug: 'audio', gradient: 'from-neutral-950 via-zinc-900 to-neutral-800' },
]

export default function HeroBanner({ locale }: { locale: Locale }) {
  const t = useTranslations('home')
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), 6000)
    return () => clearInterval(timer)
  }, [paused])

  return (
    <section
      className="group relative h-[460px] w-full select-none overflow-hidden bg-neutral-950 sm:h-[540px] lg:h-[620px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {SLIDES.map((s, i) => {
        const active = i === index
        return (
          <div
            key={s.key}
            aria-hidden={!active}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              active ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0'
            }`}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient}`} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
            <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-end px-6 pb-16 sm:px-8 sm:pb-24">
              <div className="max-w-xl space-y-4">
                <span className="inline-block text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-300 sm:text-xs">
                  {t(`hero.${s.key}.eyebrow`)}
                </span>
                {i === 0 ? (
                  <h1 className="text-4xl font-extrabold leading-[0.95] tracking-tighter text-white drop-shadow-md sm:text-6xl lg:text-7xl">
                    {t(`hero.${s.key}.title`)}
                  </h1>
                ) : (
                  <p className="font-[family-name:var(--font-heading)] text-4xl font-extrabold leading-[0.95] tracking-tighter text-white drop-shadow-md sm:text-6xl lg:text-7xl">
                    {t(`hero.${s.key}.title`)}
                  </p>
                )}
                <p className="max-w-md text-sm leading-relaxed text-neutral-300 sm:text-base">{t(`hero.${s.key}.text`)}</p>
                <div className="pt-2">
                  <Link
                    href={path(locale, `/c/${s.slug}`)}
                    tabIndex={active ? 0 : -1}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-xs font-semibold tracking-wide text-black shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-neutral-200 sm:text-sm"
                  >
                    {t(`hero.${s.key}.cta`)} <ArrowRight size={15} aria-hidden />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      <button
        type="button"
        onClick={() => setIndex((index - 1 + SLIDES.length) % SLIDES.length)}
        className="absolute left-4 top-1/2 z-30 hidden -translate-y-1/2 rounded-full bg-black/40 p-2.5 text-white/80 backdrop-blur-sm transition hover:bg-black/70 hover:text-white md:block md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        aria-label={t('heroPrev')}
      >
        <ChevronLeft size={22} />
      </button>
      <button
        type="button"
        onClick={() => setIndex((index + 1) % SLIDES.length)}
        className="absolute right-4 top-1/2 z-30 hidden -translate-y-1/2 rounded-full bg-black/40 p-2.5 text-white/80 backdrop-blur-sm transition hover:bg-black/70 hover:text-white md:block md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        aria-label={t('heroNext')}
      >
        <ChevronRight size={22} />
      </button>

      <div className="absolute bottom-6 right-6 z-30 flex items-center gap-2 sm:right-12">
        {SLIDES.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={t('heroSlide', { n: i + 1 })}
            aria-current={i === index}
            className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-8 bg-white' : 'w-2 bg-white/40 hover:bg-white/70'}`}
          />
        ))}
      </div>
    </section>
  )
}
