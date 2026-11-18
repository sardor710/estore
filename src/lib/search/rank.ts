import { tokenize } from './text'

export type Field = 'titleLocal' | 'title' | 'brand' | 'category' | 'spec' | 'sku'

/** Field weights: a hit in the shopper's own-language title counts most. */
export const WEIGHTS: Record<Field, number> = { titleLocal: 10, title: 8, brand: 7, category: 6, spec: 4, sku: 3 }
const FIELDS = Object.keys(WEIGHTS) as Field[]

export type SearchDoc = { id: number; tokens: Record<Field, string[]>; skuCompact: string[] }

/** Optimal-string-alignment distance (adjacent swaps cost 1). Returns `max + 1` once the distance exceeds `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev2: number[] = []
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return Math.min(prev[b.length], max + 1)
}

/** How well one query token matches one indexed token: 1 exact, 0.9 prefix, 0.7−0.1·typos, else 0. */
export function tokenMatch(q: string, t: string): number {
  if (q === t) return 1
  // Model numbers, capacities, years: "4060" must not match "4070", "15" must not match "15w" or "1500".
  // Only a prefix that ends where the number ends ("140" → "140w") counts, and never a typo.
  if (/\d/.test(q)) return q.length >= 3 && t.startsWith(q) && !/\d/.test(t[q.length] ?? '') ? 0.9 : 0
  if (q.length >= 2 && t.startsWith(q)) return 0.9
  const budget = q.length >= 8 ? 2 : q.length >= 4 ? 1 : 0
  if (!budget) return 0
  let d = editDistance(q, t, budget)
  // A typo inside a word still being typed: "zaryadlovh" vs "zaryadlovchilar".
  if (d > budget && t.length > q.length) d = editDistance(q, t.slice(0, q.length), budget)
  return d <= budget ? 0.7 - 0.1 * d : 0
}

/** Sum over query tokens of each token's best weighted match; 0 when any token matches nothing (AND). */
export function scoreDoc(qTokens: string[], qCompact: string, doc: SearchDoc): number {
  const skuHit = qCompact.length >= 3 && doc.skuCompact.some((s) => s.includes(qCompact))
  let total = 0
  for (const q of qTokens) {
    let best = 0
    for (const f of FIELDS) {
      for (const t of doc.tokens[f]) {
        const m = tokenMatch(q, t) * WEIGHTS[f]
        if (m > best) best = m
      }
    }
    if (best === 0 && !skuHit) return 0
    total += best
  }
  return skuHit ? total + WEIGHTS.sku : total
}

/** At most this many distinct query words are used (bounds the work per request). */
export const MAX_QUERY_TOKENS = 6

export function queryTokens(q: string): string[] {
  return [...new Set(tokenize(q))].slice(0, MAX_QUERY_TOKENS)
}

/** Ids of matching docs, best first; equal scores keep the input order. */
export function rank(q: string, docs: SearchDoc[]): number[] {
  const qTokens = queryTokens(q)
  if (!qTokens.length) return []
  const qCompact = qTokens.join('')
  return docs
    .map((doc, i) => ({ id: doc.id, i, score: scoreDoc(qTokens, qCompact, doc) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((r) => r.id)
}
