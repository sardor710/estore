/**
 * Normalizes an Uzbek phone number to `+998XXXXXXXXX` (9 subscriber digits).
 * Accepts `+998 90 123-45-67`, `998901234567`, `901234567`. Anything else -> null.
 */
export function normalizeUzPhone(input: string): string | null {
  if (typeof input !== 'string') return null
  const s = input.trim()
  if (!/^\+?[\d\s().-]+$/.test(s)) return null
  if (s.indexOf('+') > 0) return null
  const digits = s.replace(/\D/g, '')
  if (digits.length === 9) return `+998${digits}`
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`
  return null
}

/**
 * Strict variant for phones that must already be a full Uzbek international number (Telegram contact phones):
 * an optional leading '+', spaces allowed, then exactly 12 digits starting with 998 -> `+998XXXXXXXXX`.
 * No 9-digit shortcut: a foreign 9-digit number (e.g. Faroe `298123456`) must not become a +998 number.
 */
export function normalizeUzPhoneStrict(input: string): string | null {
  if (typeof input !== 'string') return null
  const s = input.replace(/\s+/g, '')
  const digits = s.startsWith('+') ? s.slice(1) : s
  if (!/^998\d{9}$/.test(digits)) return null
  return `+${digits}`
}
