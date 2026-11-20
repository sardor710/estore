'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Crosshair, Loader2, MapPin, X } from 'lucide-react'
import type { LatLng } from '@/lib/geo'
import { addressLine, forwardGeocode, regionCode, reverseGeocode } from '@/lib/yandex-geocode'

// Yandex Maps JavaScript API 2.1 (3.0 needs a paid plan on new keys). The key is public by design (it ships to the
// browser): restrict it to the store's domains with "HTTP Referer" in the Yandex Maps API console.
export const YANDEX_MAPS_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ?? ''

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


/** Yandex precision kinds precise enough to drop the delivery pin on; coarser matches only move the map. */
const PIN_KINDS = new Set(['house', 'street', 'metro', 'district', 'entrance'])
const ZOOM: Record<string, number> = { house: 17, entrance: 17, street: 16, metro: 16, district: 15, locality: 12, area: 10, province: 9 }
const TYPE_DELAY_MS = 900
const same = (a: LatLng | null, b: LatLng | null) => !!a && !!b && Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lng - b.lng) < 1e-5

/**
 * Always-visible delivery map, kept in sync with the address field both ways:
 * - the shopper drags / taps the map (or uses "my location") -> the pin is attached and, when `onAddress` is given,
 *   the address field (and region) is filled from the point;
 * - the shopper types an address (or picks a region) -> after a short pause the map moves there and drops the pin,
 *   which they can then fine-tune on the map.
 */
export default function MapPicker({
  value,
  onChange,
  locate,
  address = '',
  region = '',
  onAddress,
}: {
  value: LatLng | null
  onChange(p: LatLng | null): void
  locate(): Promise<LatLng | string>
  /** Current address-field text. */
  address?: string
  /** Display name of the selected region, used to narrow the typed-address lookup. */
  region?: string
  /** Fill the address field (and region, when recognised) from a point chosen on the map. */
  onAddress?(text: string, regionCode: string | null): void
}) {
  const t = useTranslations('location')
  const lang = LANG[useLocale()] ?? 'ru_RU'
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<YMapInstance | null>(null)
  const cb = useRef({ onChange, onAddress })
  cb.current = { onChange, onAddress }
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [moving, setMoving] = useState(false)
  const [label, setLabel] = useState<string | null>(null)
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  // Sync bookkeeping (refs: they must not re-trigger effects).
  const fillNext = useRef(false) // the next settled pin came from the shopper using the map -> fill the address field
  const quietUntil = useRef(0) // map moves we make ourselves (typed address) are not "the shopper used the map"
  const lastText = useRef(address.trim()) // address text already in sync with the pin (ours or set with it)
  const labelFor = useRef<LatLng | null>(null) // the point `label` describes
  const prev = useRef({ address, value })

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
        m.events.add('actionbegin', () => Date.now() > quietUntil.current && setMoving(true))
        m.events.add('actionend', () => {
          setMoving(false)
          if (Date.now() < quietUntil.current) return
          const [lat, lng] = m.getCenter()
          fillNext.current = true
          cb.current.onChange({ lat: round6(lat), lng: round6(lng) })
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
    if (!same({ lat, lng }, value)) {
      quietUntil.current = Date.now() + 800
      m.setCenter([value.lat, value.lng], 17)
    }
  }, [value, state])

  // Pin -> address: describe the pin under the map and, after the shopper used the map, fill the address field.
  useEffect(() => {
    if (!value) {
      setLabel(null)
      labelFor.current = null
      return
    }
    if (moving || same(labelFor.current, value)) return
    const fill = fillNext.current
    fillNext.current = false
    let done = false
    const ac = new AbortController()
    const timer = setTimeout(async () => {
      const hit = await reverseGeocode(value, lang, ac.signal)
      if (ac.signal.aborted) return
      done = true
      labelFor.current = value
      setLabel(hit?.text ?? null)
      if (hit && fill && cb.current.onAddress) {
        const line = addressLine(hit)
        lastText.current = line.trim()
        cb.current.onAddress(line, regionCode(hit))
      }
    }, 250)
    return () => {
      clearTimeout(timer)
      ac.abort()
      // an interrupted fill is retried by the next run
      if (fill && !done) fillNext.current = true
    }
  }, [value, moving, lang])

  // Address -> pin: the shopper typed an address or picked a region.
  useEffect(() => {
    const was = prev.current
    prev.current = { address, value }
    const text = address.trim()
    if (!onAddress || state !== 'ready') return
    // Address and pin replaced together (a saved address was chosen): they already match.
    if (address !== was.address && value !== was.value) {
      lastText.current = text
      return
    }
    if (text === lastText.current && value) return
    const query = text.length >= 5 ? [region, text].filter(Boolean).join(', ') : value ? '' : region
    if (!query) return
    const ac = new AbortController()
    const timer = setTimeout(async () => {
      const hit = await forwardGeocode(query, lang, ac.signal)
      const m = map.current
      if (ac.signal.aborted || !hit || !m) return
      quietUntil.current = Date.now() + 1200
      m.setCenter([hit.point.lat, hit.point.lng], ZOOM[hit.kind] ?? 11, { duration: 300 })
      if (text.length >= 5) lastText.current = text
      if (text.length >= 5 && PIN_KINDS.has(hit.kind)) {
        labelFor.current = hit.point
        setLabel(hit.text)
        cb.current.onChange(hit.point)
      }
    }, TYPE_DELAY_MS)
    return () => {
      clearTimeout(timer)
      ac.abort()
    }
    // `value` is read for the "replaced together" check only; pin moves must not re-run the lookup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, region, state, lang])

  const goToMe = async () => {
    setGeoBusy(true)
    setGeoError(null)
    const r = await locate()
    setGeoBusy(false)
    if (typeof r === 'string') return setGeoError(r)
    quietUntil.current = Date.now() + 800
    map.current?.setCenter([r.lat, r.lng], 17)
    fillNext.current = true
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
            <span className="text-neutral-800">{moving ? t('mapHint') : label ?? `${value.lat}, ${value.lng}`}</span>
            <button type="button" onClick={() => onChange(null)} className="ml-auto inline-flex shrink-0 items-center gap-1 text-neutral-600 hover:text-neutral-900">
              <X size={14} aria-hidden /> {t('remove')}
            </button>
          </>
        ) : (
          <span className="text-neutral-500">{onAddress ? t('mapSyncHint') : t('mapHint')}</span>
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
