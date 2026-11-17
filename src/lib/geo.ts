// Delivery pin (Telegram location sharing / browser geolocation). Coordinates are optional on orders and saved
// addresses; when present they must be a full, finite, in-range pair.

export type LatLng = { lat: number; lng: number }

const round6 = (n: number) => Math.round(n * 1e6) / 1e6
const absent = (v: unknown) => v === null || v === undefined

/** Both absent -> null (no pin); a valid pair -> rounded to 6 decimals; anything else -> 'INVALID'. */
export function cleanLatLng(lat: unknown, lng: unknown): LatLng | null | 'INVALID' {
  if (absent(lat) && absent(lng)) return null
  if (typeof lat !== 'number' || typeof lng !== 'number') return 'INVALID'
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'INVALID'
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return 'INVALID'
  return { lat: round6(lat), lng: round6(lng) }
}

/** Map links for staff / customers. Yandex takes lng,lat; Google takes lat,lng. */
export function mapLinks(lat: number, lng: number): { yandex: string; google: string } {
  return {
    yandex: `https://yandex.com/maps/?pt=${lng},${lat}&z=17&l=map`,
    google: `https://www.google.com/maps?q=${lat},${lng}`,
  }
}
