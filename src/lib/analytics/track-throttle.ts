import { createLimiter } from '@/lib/rate-limit'

export const TRACK_PER_MINUTE = 120
/** Without TRUST_PROXY every client shares the key "shared", so that bucket gets a larger allowance. */
export const SHARED_TRACK_PER_MINUTE = 6000

const perIp = createLimiter({ windowMs: 60_000, max: TRACK_PER_MINUTE })
const shared = createLimiter({ windowMs: 60_000, max: SHARED_TRACK_PER_MINUTE })

/** True when the request may be recorded (a slot was reserved; page views are never released). */
export function allowTrack(key: string, now?: number): boolean {
  return (key === 'shared' ? shared : perIp).reserve(key, now) !== null
}

export function resetTrackThrottle(): void {
  perIp.reset()
  shared.reset()
}
