import type { Locale } from '@/i18n/routing'

// `?next=` after sign-in. Only a same-site path under a locale prefix is accepted: no scheme, no protocol-relative
// `//host`, no backslash (browsers treat `/\host` as `//host`), no empty segments, no control characters.
const SAFE_NEXT = /^\/(uz|ru|en)(\/[^/\\]+)*\/?$/
const CONTROL = /[\u0000-\u001f\u007f]/

export function safeNext(next: string | null | undefined, locale: Locale): string {
  if (typeof next === 'string' && next.length <= 512 && !CONTROL.test(next) && !next.includes('//') && SAFE_NEXT.test(next)) {
    return next
  }
  return `/${locale}/account`
}
