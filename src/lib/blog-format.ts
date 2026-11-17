import type { Locale } from '@/i18n/routing'

const INTL: Record<Locale, string> = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-GB' }

/** "17 November 2026" in the reader's language, as a Tashkent calendar date. */
export function formatPostDate(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL[locale], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Tashkent' }).format(d)
}
