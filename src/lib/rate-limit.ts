/**
 * Small in-memory (single process) sliding-window limiter. Each attempt is RESERVED synchronously
 * before any await, so a concurrent burst cannot all pass the check; `release` gives a reservation back
 * (e.g. a successful login, or an order request that was rejected as invalid).
 */
export type Limiter = {
  /** Reserves one slot for `key` at `now` and returns its timestamp (for `release`); null when the key or the global bucket is full. */
  reserve(key: string, now?: number): number | null
  release(key: string, at: number): void
  reset(): void
  tracked(): number
}

export function createLimiter(opts: { windowMs: number; max: number; globalMax?: number; maxTracked?: number }): Limiter {
  const { windowMs, max, globalMax = Infinity, maxTracked = 10_000 } = opts
  const hits = new Map<string, number[]>()
  let global: number[] = []
  const live = (list: number[], now: number) => list.filter((t) => now - t < windowMs)

  return {
    reserve(key, now = Date.now()) {
      global = live(global, now)
      const list = live(hits.get(key) ?? [], now)
      if (list.length >= max || global.length >= globalMax) {
        if (list.length) hits.set(key, list)
        return null
      }
      if (!hits.has(key) && hits.size >= maxTracked) {
        for (const [k, v] of hits) if (live(v, now).length === 0) hits.delete(k)
        // still full: evict oldest-inserted keys
        for (const k of hits.keys()) {
          if (hits.size < maxTracked) break
          hits.delete(k)
        }
      }
      hits.delete(key) // re-insert so Map order approximates recency
      hits.set(key, [...list, now])
      global.push(now)
      return now
    },
    release(key, at) {
      const list = hits.get(key)
      if (list) {
        const i = list.lastIndexOf(at)
        if (i >= 0) list.splice(i, 1)
        if (list.length === 0) hits.delete(key)
      }
      const g = global.lastIndexOf(at)
      if (g >= 0) global.splice(g, 1)
    },
    reset() {
      hits.clear()
      global = []
    },
    tracked: () => hits.size,
  }
}

/** Client key for throttling. X-Forwarded-For is client-controlled; only honour it behind a trusted proxy (TRUST_PROXY=1). */
export function clientKey(headers: Headers): string {
  if (process.env.TRUST_PROXY !== '1') return 'shared'
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'shared'
}
