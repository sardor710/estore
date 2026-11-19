'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Crosshair, Loader2, MapPin, X } from 'lucide-react'
import type { LatLng } from '@/lib/geo'

// Yandex Maps JavaScript API 2.1 (3.0 needs a paid plan on new keys). The key is public by design (it ships to the
// browser): restrict it to the store's domains with "HTTP Referer" in the Yandex Maps API console.
export const YANDEX_MAPS_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ?? ''
// Yandex issues a separate "Geocoder API" key; without one the map key is tried (older combined keys cover both).
const GEOCODER_KEY = process.env.NEXT_PUBLIC_YANDEX_GEOCODER_API_KEY || YANDEX_MAPS_KEY

const TASHKENT: LatLng = { lat: 41.311081, lng: 69.240562 }
const round6 = (n: number) => Math.round(n * 1e6) / 1e6
const LANG: Record<string, string> = { ru: 'ru_RU', uz: 'uz_UZ', en: 'en_US' }

/* Minimal typings for the parts of ymaps 2.1 used here. 2.1 coordinates are [lat, lng]. */
type Coords = [number, number]
type YEvent = { get(name: 'coords'): Coords }
type YMapInstance = {
  getCenter(): Coords
  setCenter(c: Coords, zoom?: number, opts?: { duration?: number }): void
  events: { add(type: string | string[], cb: (e: YEvent) => void): void }
  destroy(): void
}
type Ymaps = {
  ready(cb: () => void, err?: (e: unknown) => void): void
  Map: new (el: HTMLElement, state: { center: Coords; zoom: number; controls: string[] }, opts?: object) => YMapInstance
}
declare global {
  interface Window {
    ymaps?: Ymaps
  }
}

const ready = (y: Ymaps) => new Promise<Ymaps>((res, rej) => y.ready(() => res(y), rej))
let loader: Promise<Ymaps> | null = null
/** Loads the Yandex script once per page; a failed load can be retried. */
function loadYmaps(lang: string): Promise<Ymaps> {
  if (window.ymaps) return ready(window.ymaps)
  if (loader) return loader
  loader = new Promise<Ymaps>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(YANDEX_MAPS_KEY)}&lang=${lang}`
    s.async = true
    s.onload = () => (window.ymaps ? ready(window.ymaps).then(resolve, reject) : reject(new Error('ymaps')))
    s.onerror = () => reject(new Error('ymaps script'))
    document.head.appendChild(s)
  }).catch((e) => {
    loader = null
    throw e
  })
  return loader
}

/** Street address for a point via the Yandex HTTP Geocoder (same key); null when unknown. */
async function reverseGeocode(p: LatLng, lang: string, signal: AbortSignal): Promise<string | null> {
  const url =
    `https://geocode-maps.yandex.ru/1.x/?apikey=${encodeURIComponent(GEOCODER_KEY)}` +
    `&geocode=${p.lng},${p.lat}&format=json&results=1&lang=${lang}`
  try {
    const r = await fetch(url, { signal })
    if (!r.ok) return null
    const j = await r.json()
    const geo = j?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject
    return (geo?.metaDataProperty?.GeocoderMetaData?.text as string | undefined) ?? geo?.name ?? null
  } catch {
    return null
  }
}

/**
 * Always-visible delivery map: the shopper drags the map under a fixed centre pin (or taps a spot, or uses
 * "my location"), and the point is attached as soon as the map settles. The street address shows underneath.
 * `locate` is the device-location lookup shared with LocationButton.
 */
export default function MapPicker({
  value,
  onChange,
  locate,
}: {
  value: LatLng | null
  onChange(p: LatLng | null): void
  locate(): Promise<LatLng | string>
}) {
  const t = useTranslations('location')
  const lang = LANG[useLocale()] ?? 'ru_RU'
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<YMapInstance | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [moving, setMoving] = useState(false)
  const [address, setAddress] = useState<string | null>(null)
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const start = value ?? TASHKENT
    loadYmaps(lang)
      .then((y) => {
        if (cancelled || !el.current) return
        const m = new y.Map(
          el.current,
          { center: [start.lat, start.lng], zoom: value ? 17 : 12, controls: ['zoomControl'] },
          { suppressMapOpenBlock: true, yandexMapDisablePoiInteractivity: true },
        )
        m.events.add('actionbegin', () => setMoving(true))
        m.events.add('actionend', () => {
          const [lat, lng] = m.getCenter()
          setMoving(false)
          onChangeRef.current({ lat: round6(lat), lng: round6(lng) })
        })
        m.events.add('click', (e) => m.setCenter(e.get('coords'), undefined, { duration: 300 }))
        map.current = m
        setState('ready')
      })
      .catch(() => !cancelled && setState('error'))
    return () => {
      cancelled = true
      map.current?.destroy()
      map.current = null
    }
    // the map is created once; later value changes move it (below) instead of rebuilding it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  // A pin set from outside (a saved address, "Share my location") moves the map there.
  useEffect(() => {
    const m = map.current
    if (!m || !value) return
    const [lat, lng] = m.getCenter()
    if (Math.abs(lat - value.lat) > 1e-5 || Math.abs(lng - value.lng) > 1e-5) m.setCenter([value.lat, value.lng], 17)
  }, [value, state])

  // Street address of the attached point, after the map settles.
  useEffect(() => {
    setAddress(null)
    if (!value || moving) return
    const ac = new AbortController()
    const timer = setTimeout(() => reverseGeocode(value, lang, ac.signal).then((a) => !ac.signal.aborted && setAddress(a)), 300)
    return () => {
      clearTimeout(timer)
      ac.abort()
    }
  }, [value, moving, lang])

  const goToMe = async () => {
    setGeoBusy(true)
    setGeoError(null)
    const r = await locate()
    setGeoBusy(false)
    if (typeof r === 'string') return setGeoError(r)
    map.current?.setCenter([r.lat, r.lng], 17)
    onChange(r)
  }

  return (
    <div>
      <div className="relative h-72 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 sm:h-80">
        <div ref={el} className="absolute inset-0" aria-label={t('pickTitle')} />
        {state === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
            <Loader2 size={18} className="mr-2 animate-spin" aria-hidden /> {t('mapLoading')}
          </div>
        )}
        {state === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-600">{t('mapError')}</div>
        )}
        {state === 'ready' && (
          <>
            {/* Fixed centre pin: its tip marks the chosen point. */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full" aria-hidden>
              <MapPin
                size={40}
                strokeWidth={2.2}
                className={`drop-shadow transition-transform ${value ? 'fill-red-500 text-red-700' : 'fill-neutral-300 text-neutral-500'} ${moving ? '-translate-y-2' : ''}`}
              />
            </div>
            <button
              type="button"
              onClick={goToMe}
              disabled={geoBusy}
              aria-label={t('myLocation')}
              title={t('myLocation')}
              className="absolute bottom-10 right-3 rounded-full bg-white p-3 text-neutral-800 shadow-md hover:bg-neutral-50 disabled:opacity-70"
            >
              {geoBusy ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <Crosshair size={20} aria-hidden />}
            </button>
          </>
        )}
      </div>
      <div className="mt-2 flex items-start gap-3 text-sm" aria-live="polite">
        {value ? (
          <>
            <MapPin size={16} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden />
            <span className="text-neutral-800">{moving ? t('mapHint') : address ?? `${value.lat}, ${value.lng}`}</span>
            <button type="button" onClick={() => onChange(null)} className="ml-auto inline-flex shrink-0 items-center gap-1 text-neutral-600 hover:text-neutral-900">
              <X size={14} aria-hidden /> {t('remove')}
            </button>
          </>
        ) : (
          <span className="text-neutral-500">{t('mapHint')}</span>
        )}
      </div>
      {geoError && (
        <p role="alert" className="mt-1 text-xs font-medium text-red-600">
          {t(geoError)}
        </p>
      )}
    </div>
  )
}
