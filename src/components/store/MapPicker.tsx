'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
 * Full-screen map dialog: the shopper drags the map under a fixed centre pin (or taps a spot), sees the street
 * address and confirms. `locate` is the device-location lookup shared with LocationButton.
 */
export default function MapPicker({
  initial,
  onPick,
  onClose,
  locate,
}: {
  initial: LatLng | null
  onPick(p: LatLng, address: string | null): void
  onClose(): void
  locate(): Promise<LatLng | string>
}) {
  const t = useTranslations('location')
  const lang = LANG[useLocale()] ?? 'ru_RU'
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<YMapInstance | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [center, setCenter] = useState<LatLng>(initial ?? TASHKENT)
  const [moving, setMoving] = useState(false)
  const [address, setAddress] = useState<string | null>(null)
  const [geoBusy, setGeoBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const start = initial ?? TASHKENT
    loadYmaps(lang)
      .then((y) => {
        if (cancelled || !el.current) return
        const m = new y.Map(
          el.current,
          { center: [start.lat, start.lng], zoom: initial ? 17 : 12, controls: ['zoomControl'] },
          { suppressMapOpenBlock: true, yandexMapDisablePoiInteractivity: true },
        )
        m.events.add('actionbegin', () => setMoving(true))
        m.events.add('actionend', () => {
          const [lat, lng] = m.getCenter()
          setMoving(false)
          setCenter({ lat: round6(lat), lng: round6(lng) })
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
    // the map is created once per opening; later `initial` changes are irrelevant while it is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  // Address under the pin, after the map settles.
  useEffect(() => {
    if (state !== 'ready' || moving) return
    const ac = new AbortController()
    const timer = setTimeout(() => {
      setAddress(null)
      reverseGeocode(center, lang, ac.signal).then((a) => !ac.signal.aborted && setAddress(a))
    }, 350)
    return () => {
      clearTimeout(timer)
      ac.abort()
    }
  }, [center, moving, state, lang])

  // Esc closes; the page behind does not scroll.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const goToMe = async () => {
    setGeoBusy(true)
    const r = await locate()
    setGeoBusy(false)
    if (typeof r !== 'string') map.current?.setCenter([r.lat, r.lng], 17, { duration: 400 })
  }

  // Portalled to <body> so no sticky header or stacking context of the form can sit above the dialog.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t('pickTitle')} className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div className="flex h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white sm:h-[80vh] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
          <h2 className="text-base font-semibold text-neutral-900">{t('pickTitle')}</h2>
          <button type="button" onClick={onClose} aria-label={t('cancel')} className="rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900">
            <X size={20} aria-hidden />
          </button>
        </div>

        <div className="relative flex-1 bg-neutral-100">
          <div ref={el} className="absolute inset-0" />
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
                <MapPin size={40} strokeWidth={2.2} className={`fill-red-500 text-red-700 drop-shadow transition-transform ${moving ? '-translate-y-2' : ''}`} />
              </div>
              <button
                type="button"
                onClick={goToMe}
                disabled={geoBusy}
                aria-label={t('myLocation')}
                title={t('myLocation')}
                className="absolute bottom-4 right-4 rounded-full bg-white p-3 text-neutral-800 shadow-md hover:bg-neutral-50 disabled:opacity-70"
              >
                {geoBusy ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <Crosshair size={20} aria-hidden />}
              </button>
            </>
          )}
        </div>

        <div className="space-y-3 border-t border-neutral-100 px-4 py-3">
          <p className="min-h-[1.25rem] text-sm text-neutral-700" aria-live="polite">
            {state === 'ready' ? (moving ? t('mapHint') : address ?? `${center.lat}, ${center.lng}`) : ''}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-full border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-800 hover:border-neutral-400">
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={state !== 'ready' || moving}
              onClick={() => onPick(center, address)}
              className="flex-[2] rounded-full bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {t('confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
