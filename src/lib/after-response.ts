import { after } from 'next/server'

/**
 * Runs `task` after the response is sent (Next.js `after()`), so the platform keeps it alive.
 * Outside a request scope (scripts, tests) `after` throws: fall back to fire-and-forget.
 * Errors are always swallowed: background work must never affect the caller.
 */
export function runAfterResponse(task: () => Promise<unknown>): void {
  const safe = () => Promise.resolve().then(task).catch(() => {})
  try {
    after(safe)
  } catch {
    void safe()
  }
}
