// Text folding for product search: every query and every indexed field goes through `tokenize`, so
// "Oʻzbek", "O'zbek", "Ўзбек" and "OZBEK" all become the same token ("ozbek").

const APOSTROPHES = /[ʻʼ’‘'`´]/g

const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'e', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', қ: 'q',
  л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ў: 'o', ф: 'f', х: 'x', ҳ: 'h', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ь: '', ы: 'y', э: 'e', ю: 'yu', я: 'ya',
}

/** Lowercase (NFC) with Uzbek/typographic apostrophes removed. */
export function normalize(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(APOSTROPHES, '')
}

/** Cyrillic (Russian + Uzbek) to Latin; other characters unchanged. Expects lowercase input. */
export function toLatin(s: string): string {
  let out = ''
  for (const ch of s) out += CYR[ch] ?? ch
  return out
}

/** Folded search tokens: lowercase Latin letters and digits only. */
export function tokenize(s: string): string[] {
  if (!s) return []
  const latin = toLatin(normalize(s))
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
  return latin.split(/[^a-z0-9]+/).filter(Boolean)
}
