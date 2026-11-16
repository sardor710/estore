import type { Locale } from '@/i18n/routing'

/** Locale-prefixed path, e.g. path('uz', '/c/chargers') -> '/uz/c/chargers'. */
export function path(locale: Locale, rest = ''): string {
  return `/${locale}${rest === '/' ? '' : rest}`
}
