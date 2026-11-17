import { createSharedAwareLimiter } from '@/lib/rate-limit'

/**
 * POST /api/tg/session: 30 launches/min per client key (the Mini App also polls it while a phone is being linked).
 * Without TRUST_PROXY every client is key 'shared', which gets its own larger cap instead of 30/min for everyone.
 */
export const tgSessionLimiter = createSharedAwareLimiter({ windowMs: 60_000, max: 30, sharedMax: 3000 })

export function resetTgSessionLimits(): void {
  tgSessionLimiter.reset()
}
