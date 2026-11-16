import { createLimiter } from '@/lib/rate-limit'

export const ORDERS_PER_WINDOW = 5
export const ORDER_WINDOW_MS = 10 * 60_000
/**
 * Without TRUST_PROXY every client shares the key "shared", so that bucket gets a larger allowance
 * (a per-ip limit of 5 would block the whole shop). Behind a proxy set TRUST_PROXY=1 for per-ip limits.
 */
export const SHARED_ORDERS_PER_WINDOW = 30

const perIp = createLimiter({ windowMs: ORDER_WINDOW_MS, max: ORDERS_PER_WINDOW })
const shared = createLimiter({ windowMs: ORDER_WINDOW_MS, max: SHARED_ORDERS_PER_WINDOW })

export const orderLimiter = {
  reserve: (key: string, now?: number) => (key === 'shared' ? shared : perIp).reserve(key, now),
  release: (key: string, at: number) => (key === 'shared' ? shared : perIp).release(key, at),
}

export function resetOrderThrottle(): void {
  perIp.reset()
  shared.reset()
}
