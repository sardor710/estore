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
