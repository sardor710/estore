// Yandex HTTP Geocoder helpers for the delivery map: point -> address text (+ region code) and text -> point.
// Pure parsing is separated from fetching so it can be unit-tested without the network.
import type { LatLng } from '@/lib/geo'

export const GEOCODER_KEY = process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY || process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY || ''
const ENDPOINT = 'https://geocode-maps.yandex.ru/1.x/'
/** Rough bounding box of Uzbekistan (lng,lat~lng,lat): text lookups prefer results inside it. */
const UZ_BBOX = '55.9,37.1~73.2,45.6'

export type GeoComponent = { kind: string; name: string }
export type GeoHit = {
  point: LatLng
  /** Yandex precision kind of the match: house, street, district, locality, province, country... */
  kind: string
  /** Full one-line address ("Uzbekistan, Tashkent, ..."). */
  text: string
  components: GeoComponent[]
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** First hit of a Geocoder JSON response, or null. */
export function parseGeocoderResponse(json: unknown): GeoHit | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geo = (json as any)?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject
  if (!geo) return null
  const pos = typeof geo.Point?.pos === 'string' ? geo.Point.pos.split(' ').map(Number) : []
  if (pos.length !== 2 || !pos.every(Number.isFinite)) return null
  const meta = geo.metaDataProperty?.GeocoderMetaData ?? {}
  const components: GeoComponent[] = Array.isArray(meta.Address?.Components)
    ? meta.Address.Components.filter((c: GeoComponent) => typeof c?.kind === 'string' && typeof c?.name === 'string')
    : []
  return {
    point: { lat: round6(pos[1]), lng: round6(pos[0]) },
    kind: typeof meta.kind === 'string' ? meta.kind : '',
    text: typeof meta.text === 'string' ? meta.text : (geo.name ?? ''),
    components,
  }
}

const ADDRESS_KINDS = new Set(['locality', 'district', 'street', 'house'])

/**
 * Text for the address field: locality, district, street and house ("Tashkent, Chilanzar District, Bunyodkor
 * Avenue, 10"). Country and province are left out (the region has its own field). Falls back to the full text
 * without the country.
 */
export function addressLine(hit: GeoHit): string {
  const parts: string[] = []
  for (const c of hit.components) if (ADDRESS_KINDS.has(c.kind) && !parts.includes(c.name)) parts.push(c.name)
  if (parts.length) return parts.join(', ')
  const country = hit.components.find((c) => c.kind === 'country')?.name
  return country && hit.text.startsWith(country + ', ') ? hit.text.slice(country.length + 2) : hit.text
}

// Name stems (en / uz / ru) of each store region as the Geocoder spells provinces.
const REGION_STEMS: [code: string, stems: string[]][] = [
  ['andijan', ['andijan', 'andijon', 'андижан']],
  ['bukhara', ['bukhara', 'buxoro', 'бухар']],
  ['fergana', ['fergana', 'farg', 'фергана', 'ферганск']],
  ['jizzakh', ['jizzakh', 'jizzax', 'джизак']],
  ['kashkadarya', ['kashkadarya', 'qashqadaryo', 'кашкадар']],
  ['khorezm', ['khorezm', 'xorazm', 'хорезм']],
  ['namangan', ['namangan', 'наманган']],
  ['navoi', ['navoi', 'navoiy', 'навои']],
  ['samarkand', ['samarkand', 'samarqand', 'самарканд']],
  ['surkhandarya', ['surkhandarya', 'surxondaryo', 'сурхандар']],
  ['syrdarya', ['syrdarya', 'sirdaryo', 'сырдар']],
  ['karakalpakstan', ['karakalpak', 'qoraqalpog', 'каракалпак']],
]
const TASHKENT_STEMS = ['tashkent', 'toshkent', 'ташкент']
const REGION_MARKERS = ['region', 'viloyat', 'област', 'oblast']

/** Store region code for a hit's province(s), or null when it is outside the known regions. */
export function regionCode(hit: GeoHit): string | null {
  const provinces = hit.components.filter((c) => c.kind === 'province').map((c) => c.name.toLowerCase())
  // The most specific province comes last ("Uzbekistan" > "Tashkent Region").
  for (const p of provinces.reverse()) {
    if (TASHKENT_STEMS.some((s) => p.includes(s))) return REGION_MARKERS.some((m) => p.includes(m)) ? 'tashkent' : 'tashkent-city'
    const found = REGION_STEMS.find(([, stems]) => stems.some((s) => p.includes(s)))
    if (found) return found[0]
  }
  return null
}

async function request(params: string, signal: AbortSignal): Promise<GeoHit | null> {
  if (!GEOCODER_KEY) return null
  try {
    const r = await fetch(`${ENDPOINT}?apikey=${encodeURIComponent(GEOCODER_KEY)}&format=json&results=1&${params}`, { signal })
    return r.ok ? parseGeocoderResponse(await r.json()) : null
  } catch {
    return null
  }
}

/** Address at a point (lang: ru_RU / uz_UZ / en_US): the nearest building, else whatever is there (street, area). */
export async function reverseGeocode(p: LatLng, lang: string, signal: AbortSignal): Promise<GeoHit | null> {
  const geocode = `geocode=${p.lng},${p.lat}&lang=${lang}`
  return (await request(`${geocode}&kind=house`, signal)) ?? (signal.aborted ? null : request(geocode, signal))
}

/** Point for typed address text, preferring results inside Uzbekistan. */
export const forwardGeocode = (text: string, lang: string, signal: AbortSignal) =>
  request(`geocode=${encodeURIComponent(text)}&bbox=${UZ_BBOX}&rspn=1&lang=${lang}`, signal)
