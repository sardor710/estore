import type { Locale } from '@/i18n/routing'

// Display helpers for the account area (safe in server and client components). Dates are shown as
// Asia/Tashkent wall-clock time, whatever the server or browser time zone is.

const INTL: Record<Locale, string> = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-GB' }

/** "17 November 2026" */
export function formatDay(d: Date | string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL[locale], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Tashkent' }).format(new Date(d))
}

/** "17 November 2026, 14:05" */
export function formatDateTime(d: Date | string, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Tashkent',
  }).format(new Date(d))
}

/** "+998901234567" -> "+998 90 123 45 67" (anything else unchanged). */
export function formatPhone(phone: string): string {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone)
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone
}

/** First letter of the name for the avatar, or null. */
export function initialOf(name: string): string | null {
  const ch = Array.from(name.trim())[0]
  return ch ? ch.toLocaleUpperCase() : null
}

export const ORDER_STATUSES = ['NEW', 'CONFIRMED', 'SHIPPING', 'DELIVERED', 'CANCELLED'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]
export const isOrderStatus = (s: string): s is OrderStatus => (ORDER_STATUSES as readonly string[]).includes(s)
