import type { Locale } from './routing'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** { a: { b: 'x' } } -> { 'a.b': 'x' } (strings only). */
export function flattenMessages(obj: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (!isObj(obj)) return out
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[key] = v
    else if (isObj(v)) flattenMessages(v, key, out)
  }
  return out
}

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Deep-merges UiString overrides ({uz?,ru?,en?} per flattened dot key) for `locale` on top of the
 * messages file. Empty values are ignored. A key can never replace a string leaf with a branch.
 */
export function applyUiOverrides<T extends Obj>(base: T, locale: Locale, rows: { key: string; value: unknown }[]): T {
  const out = structuredClone(base) as Obj
  for (const { key, value } of rows) {
    if (!isObj(value)) continue
    const v = value[locale]
    if (typeof v !== 'string' || v.trim() === '') continue
    const parts = key.split('.')
    if (parts.some((p) => !p || FORBIDDEN.has(p))) continue
    let cur = out
    let ok = true
    for (const p of parts.slice(0, -1)) {
      const next = cur[p]
      if (next === undefined) cur = cur[p] = {}
      else if (isObj(next)) cur = next
      else {
        ok = false
        break
      }
    }
    const last = parts[parts.length - 1]
    if (ok && typeof cur[last] !== 'object') cur[last] = v
  }
  return out as T
}
