import { prisma } from '@/lib/db'
import { sanitizeHtml } from '@/lib/sanitize'
import enMessages from '../../../messages/en.json'
import uzMessages from '../../../messages/uz.json'
import ruMessages from '../../../messages/ru.json'
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import { getTranslator } from './claude'
import { TranslationError, type TargetLocale, type Translator } from './types'

const TARGETS: TargetLocale[] = ['uz', 'ru']

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const clone = <T>(v: T): T => structuredClone(v)

/**
 * Spec values are translated only when they contain a real word. Pure numbers, units and
 * all-caps acronyms ("100W", "6.81 oz (193 g)", "USB-C", "GaN") stay untranslated: a value needs
 * translating iff some run of 2+ letters is neither all-uppercase nor a known unit/abbreviation.
 */
const UNIT_RUNS = /^(mm|cm|kg|oz|lb|lbs|wh|mah|hz|khz|mhz|ghz|gb|tb|mb|db|ms|min|gan|gbps|mbps|in)$/i
export function needsTranslation(value: string): boolean {
  const runs = value.match(/\p{L}+/gu) ?? []
  return runs.some((r) => r.length >= 2 && r !== r.toUpperCase() && !UNIT_RUNS.test(r))
}

/** One translatable string and where to put the result. */
type Slot = { en: string; assign: (translated: string) => void }

/** Registers `obj[locale]` as the target for `obj.en` when EN text is non-empty. */
function l10nSlot(slots: Slot[], obj: unknown, locale: TargetLocale, html = false) {
  if (!isObj(obj)) return
  const en = obj.en
  if (typeof en !== 'string' || en.trim() === '') return
  slots.push({ en, assign: (v) => void (obj[locale] = html ? sanitizeHtml(v) : v) })
}

type Working = {
  title: unknown
  subtitle: unknown
  shortSpec: unknown
  descriptionHtml: unknown
  sections: unknown[]
  highlights: unknown[]
  inTheBox: unknown[]
  faq: unknown[]
  specs: unknown[]
  variants: { id: number; name: unknown }[]
}

function collectProductSlots(w: Working, locale: TargetLocale): Slot[] {
  const slots: Slot[] = []
  l10nSlot(slots, w.title, locale)
  l10nSlot(slots, w.subtitle, locale)
  l10nSlot(slots, w.shortSpec, locale)
  l10nSlot(slots, w.descriptionHtml, locale, true)
  for (const s of w.sections) {
    if (!isObj(s)) continue
    l10nSlot(slots, s.heading, locale)
    l10nSlot(slots, s.body, locale)
  }
  for (const h of w.highlights) if (isObj(h)) l10nSlot(slots, h.title, locale)
  for (const b of w.inTheBox) l10nSlot(slots, b, locale)
  for (const f of w.faq) {
    if (!isObj(f)) continue
    l10nSlot(slots, f.q, locale)
    l10nSlot(slots, f.a, locale)
  }
  for (const g of w.specs) {
    if (!isObj(g)) continue
    for (const item of arr(g.items)) {
      if (!isObj(item) || typeof item.value !== 'string' || !needsTranslation(item.value)) continue
      slots.push({
        en: item.value,
        assign: (v) => {
          item.valueL10n = { ...(isObj(item.valueL10n) ? item.valueL10n : {}), [locale]: v }
        },
      })
    }
  }
  for (const v of w.variants) l10nSlot(slots, v.name, locale)
  return slots
}

/** Runs the translator over unique strings and validates the answer; any problem => TranslationError. */
async function run(
  translator: Translator,
  texts: string[],
  to: TargetLocale,
  check?: (source: string, translated: string) => void,
): Promise<Map<string, string>> {
  const unique = [...new Set(texts)]
  const map = new Map<string, string>()
  if (unique.length === 0) return map
  let out: string[]
  try {
    out = await translator.translate(unique, to)
  } catch (e) {
    if (e instanceof TranslationError) throw e
    throw new TranslationError(`Translation to ${to} failed: ${e instanceof Error ? e.message : String(e)}`, {
      cause: e,
    })
  }
  if (!Array.isArray(out) || out.length !== unique.length || out.some((s) => typeof s !== 'string')) {
    throw new TranslationError(
      `Translator returned ${Array.isArray(out) ? out.length : 'invalid'} results for ${unique.length} strings (${to})`,
    )
  }
  unique.forEach((t, i) => {
    check?.(t, out[i])
    map.set(t, out[i])
  })
  return map
}

export type TranslateResult = { status: 'done' | 'not_configured'; translated: number }

/**
 * Machine-translates a product from its EN source into uz/ru. For every locale that is not
 * `reviewed` (or all, with `force`) every translatable text is OVERWRITTEN from EN. Everything is
 * translated first, validated, then written in a single transaction; on any error nothing is written.
 * Missing SpecLabel uz/ru for labels used by the product are filled for the processed locales.
 */
export async function translateProduct(
  productId: number,
  opts: { force?: boolean; translator?: Translator } = {},
): Promise<TranslateResult> {
  const translator = opts.translator ?? getTranslator()
  if (!translator) return { status: 'not_configured', translated: 0 }

  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId }, include: { variants: true } })
  const reviewed = isObj(product.reviewed) ? product.reviewed : {}
  const locales = TARGETS.filter((l) => opts.force || reviewed[l] !== true)
  if (locales.length === 0) return { status: 'done', translated: 0 }

  const w: Working = {
    title: clone(product.title),
    subtitle: clone(product.subtitle),
    shortSpec: clone(product.shortSpec),
    descriptionHtml: clone(product.descriptionHtml),
    sections: clone(arr(product.sections)),
    highlights: clone(arr(product.highlights)),
    inTheBox: clone(arr(product.inTheBox)),
    faq: clone(arr(product.faq)),
    specs: clone(arr(product.specs)),
    variants: product.variants.map((v) => ({ id: v.id, name: clone(v.name) })),
  }

  // SpecLabel keys used by this product.
  const keys = new Set<string>()
  for (const g of w.specs) {
    if (!isObj(g)) continue
    if (typeof g.group === 'string' && g.group) keys.add(g.group)
    for (const i of arr(g.items)) if (isObj(i) && typeof i.label === 'string' && i.label) keys.add(i.label)
  }
  const labelRows = keys.size ? await prisma.specLabel.findMany({ where: { key: { in: [...keys] } } }) : []
  const labels = labelRows.map((r) => ({
    key: r.key,
    label: clone(isObj(r.label) ? r.label : {}) as Record<string, string>,
  }))

  let translated = 0
  for (const locale of locales) {
    const slots = collectProductSlots(w, locale)
    const labelSlots = labels.filter((l) => (l.label.en ?? '').trim() !== '' && !(l.label[locale] ?? '').trim())
    const texts = [...slots.map((s) => s.en), ...labelSlots.map((l) => l.label.en)]
    const map = await run(translator, texts, locale)
    for (const s of slots) s.assign(map.get(s.en) as string)
    for (const l of labelSlots) l.label[locale] = map.get(l.label.en) as string
    translated += texts.length
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: {
        title: w.title as never,
        subtitle: w.subtitle as never,
        shortSpec: w.shortSpec as never,
        descriptionHtml: w.descriptionHtml as never,
        sections: w.sections as never,
        highlights: w.highlights as never,
        inTheBox: w.inTheBox as never,
        faq: w.faq as never,
        specs: w.specs as never,
      },
    })
    for (const v of w.variants) await tx.variant.update({ where: { id: v.id }, data: { name: v.name as never } })
    for (const l of labels) await tx.specLabel.update({ where: { key: l.key }, data: { label: l.label } })
  })
  return { status: 'done', translated }
}

/** Argument / tag names used by an ICU message (recursing into plural/select options and tags). */
function icuArguments(message: string): Set<string> {
  const names = new Set<string>()
  const walk = (els: MessageFormatElement[]) => {
    for (const el of els) {
      if (el.type === TYPE.literal || el.type === TYPE.pound) continue
      if (el.type === TYPE.tag) names.add(`<${el.value}>`)
      else names.add(el.value)
      if (el.type === TYPE.tag) walk(el.children)
      if (el.type === TYPE.plural || el.type === TYPE.select) for (const o of Object.values(el.options)) walk(o.value)
    }
  }
  walk(parse(message))
  return names
}

/**
 * A UI translation must parse as ICU and use exactly the argument names of its EN source
 * ({count}, {name}, plural/select arguments, rich-text tags), otherwise next-intl would fail at render time.
 * Plural option keywords are not compared: Russian legitimately needs few/many.
 */
export function assertSameIcuArguments(source: string, translated: string): void {
  let want: Set<string>
  try {
    want = icuArguments(source)
  } catch {
    return // EN source itself is not parseable ICU; nothing to compare against
  }
  let got: Set<string>
  try {
    got = icuArguments(translated)
  } catch (e) {
    throw new TranslationError(`Translation is not a valid ICU message: ${JSON.stringify(translated)}`, { cause: e })
  }
  const same = want.size === got.size && [...want].every((n) => got.has(n))
  if (!same) {
    throw new TranslationError(
      `Translation changed ICU placeholders: expected {${[...want].join(', ')}}, got {${[...got].join(', ')}} in ${JSON.stringify(translated)}`,
    )
  }
}

type Dict = { [k: string]: string | Dict }
export type MessageSet = { en: Dict; uz: Dict; ru: Dict }

function flatten(d: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (!isObj(d)) return out
  for (const [k, v] of Object.entries(d)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[key] = v
    else flatten(v, key, out)
  }
  return out
}

/**
 * For every key in messages/en.json whose effective uz/ru value (UiString override, else the
 * messages file) is empty or missing, translate from EN and store it in UiString. Never touches
 * a value that already exists. All-or-nothing like translateProduct.
 */
export async function translateUiMissing(
  opts: { translator?: Translator; messages?: MessageSet } = {},
): Promise<TranslateResult> {
  const translator = opts.translator ?? getTranslator()
  if (!translator) return { status: 'not_configured', translated: 0 }

  const msgs = opts.messages ?? { en: enMessages as Dict, uz: uzMessages as Dict, ru: ruMessages as Dict }
  const en = flatten(msgs.en)
  const files: Record<TargetLocale, Record<string, string>> = { uz: flatten(msgs.uz), ru: flatten(msgs.ru) }
  const overrides = new Map((await prisma.uiString.findMany()).map((u) => [u.key, isObj(u.value) ? u.value : {}]))

  const pending: Record<string, Partial<Record<TargetLocale, string>>> = {}
  let translated = 0
  for (const locale of TARGETS) {
    const keys = Object.keys(en).filter((k) => {
      if (en[k].trim() === '') return false
      const o = overrides.get(k)?.[locale]
      const effective = typeof o === 'string' && o.trim() !== '' ? o : files[locale][k]
      return !effective || effective.trim() === ''
    })
    const map = await run(
      translator,
      keys.map((k) => en[k]),
      locale,
      assertSameIcuArguments,
    )
    for (const k of keys) (pending[k] ??= {})[locale] = map.get(en[k]) as string
    translated += keys.length
  }

  const entries = Object.entries(pending)
  if (entries.length > 0) {
    await prisma.$transaction(
      entries.map(([key, add]) => {
        const value = { ...(overrides.get(key) ?? {}), ...add } as never
        return prisma.uiString.upsert({ where: { key }, create: { key, value }, update: { value } })
      }),
    )
  }
  return { status: 'done', translated }
}
