'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, MapPin, X } from 'lucide-react'
import { mapLinks, type LatLng } from '@/lib/geo'
import { getWebApp } from '@/components/tg/webapp'

type Err = 'denied' | 'unavailable'
const TIMEOUT_MS = 10_000
const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** Telegram's LocationManager (Bot API 8.0+) when available inside the Mini App, else the browser geolocation API. */
function locate(): Promise<LatLng | Err> {
  const app = getWebApp()
  const lm = app && app.isVersionAtLeast('8.0') ? app.LocationManager : undefined
  const viaBrowser = () =>
    new Promise<LatLng | Err>((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve('unavailable')
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: round6(p.coords.latitude), lng: round6(p.coords.longitude) }),
        (e) => resolve(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable'),
        { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 60_000 },
      )
    })
  if (!lm) return viaBrowser()
  return new Promise((resolve) => {
    let settled = false
    const finish = (v: LatLng | Err | Promise<LatLng | Err>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(v)
    }
    // a Telegram client that never calls back must not leave the spinner running
    const timer = setTimeout(() => finish(viaBrowser()), TIMEOUT_MS)
    try {
      const read = () => {
        if (!lm.isLocationAvailable) return finish(viaBrowser())
        lm.getLocation((d) => finish(d ? { lat: round6(d.latitude), lng: round6(d.longitude) } : 'denied'))
      }
      if (lm.isInited) read()
      else lm.init(read)
    } catch {
      finish(viaBrowser())
    }
  })
}

/** Optional delivery pin: "Share my location" -> attached (view on map / remove). */
export default function LocationButton({ value, onChange }: { value: LatLng | null; onChange(v: LatLng | null): void }) {
  const t = useTranslations('location')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Err | null>(null)

  const share = async () => {
    setBusy(true)
    setError(null)
    const r = await locate()
    setBusy(false)
    if (typeof r === 'string') setError(r)
    else onChange(r)
  }

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
        <MapPin size={16} className="text-emerald-700" aria-hidden />
        <span className="font-semibold text-emerald-800">{t('attached')}</span>
        <a href={mapLinks(value.lat, value.lng).google} target="_blank" rel="noopener noreferrer" className="text-emerald-800 underline">
          {t('view')}
        </a>
        <button type="button" onClick={() => onChange(null)} className="ml-auto inline-flex items-center gap-1 text-neutral-600 hover:text-neutral-900">
          <X size={14} aria-hidden /> {t('remove')}
        </button>
      </div>
    )
  }
  return (
    <div>
      <button
        type="button"
        onClick={share}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 hover:border-neutral-400 disabled:opacity-70"
      >
        {busy && <Loader2 size={15} className="animate-spin" aria-hidden />}
        {busy ? t('locating') : t('share')}
      </button>
      <p className="mt-1 text-xs text-neutral-500">{t('hint')}</p>
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-red-600">
          {t(error)}
        </p>
      )}
    </div>
  )
}
