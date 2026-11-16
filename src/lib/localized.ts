import { defaultLocale, locales, type Locale } from '@/i18n/routing'

export type L10n = Partial<Record<Locale, string>>

/** Localized value for `locale`; falls back to default locale, then any other non-empty one. */
export function t(field: L10n | null | undefined, locale: Locale): string {
  if (!field) return ''
  const order = [locale, defaultLocale, ...locales]
  for (const l of order) {
    const v = field[l]
    if (typeof v === 'string' && v.trim() !== '') return v
  }
  return ''
}
