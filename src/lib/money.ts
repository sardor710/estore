import type { Locale } from '@/i18n/routing'

const NBSP = '\u00a0'

function group(amount: number, sep: string): string {
  const n = Math.round(amount)
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep)
  return n < 0 ? `-${digits}` : digits
}

/** Formats an integer UZS amount for display. */
export function formatUzs(amount: number, locale: Locale): string {
  switch (locale) {
    case 'uz':
      return `${group(amount, NBSP)} so\u02bbm`
    case 'ru':
      return `${group(amount, NBSP)} сум`
    default:
      return `${group(amount, ',')} UZS`
  }
}
