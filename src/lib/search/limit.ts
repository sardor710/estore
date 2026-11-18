import { createSharedAwareLimiter } from '@/lib/rate-limit'

/**
 * Live suggestions are requested on every (debounced) keystroke: 120 a minute per client is far above real typing,
 * low enough that one script cannot tie up the server. Without TRUST_PROXY all clients share the larger bucket.
 */
export const suggestLimiter = createSharedAwareLimiter({ windowMs: 60_000, max: 120, sharedMax: 3000 })
