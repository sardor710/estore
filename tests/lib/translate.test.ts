import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '@/lib/db'
import {
  translateProduct,
  translateUiMissing,
  getTranslator,
  isTranslationConfigured,
  ClaudeTranslator,
  TranslationError,
  type Translator,
} from '@/lib/translate'

const fake: Translator = {
  async translate(texts, to) {
    return texts.map((s) => `[${to}] ${s}`)
  },
}

async function mkProduct(over: Record<string, unknown> = {}) {
  const cat = await prisma.category.create({ data: { slug: 'chargers', name: { en: 'Chargers' } } })
  return prisma.product.create({
    data: {
      slug: 'p1',
      categoryId: cat.id,
      brand: 'Anker',
      title: { en: 'Laptop Charger Pro' },
      subtitle: { en: 'Fast charging' },
      shortSpec: { en: '100W Max' },
      descriptionHtml: { en: '<p class="x">Charge <strong>fast</strong></p><script>alert(1)</script>' },
      sections: [{ heading: { en: 'Compact' }, body: { en: 'Small body' } }],
      highlights: [{ title: { en: 'Safe charging' }, value: '100W' }],
      inTheBox: [{ en: 'Charger' }, { en: 'Cable' }],
      faq: [{ q: { en: 'Is it safe?' }, a: { en: 'Yes it is' } }],
      specs: [
        {
          group: 'general',
          items: [
            { label: 'max-output', value: '100W' },
            { label: 'ports', value: 'USB-C' },
            { label: 'material', value: 'Fire-retardant plastic' },
          ],
        },
      ],
      images: [],
      reviewed: { uz: false, ru: false },
      variants: { create: [{ sku: 'S1', name: { en: 'Iron Gray' }, priceUzs: 0 }] },
      ...over,
    },
  })
}

const reload = (id: number) =>
  prisma.product.findUniqueOrThrow({ where: { id }, include: { variants: true } })

describe('translateProduct', () => {
  it('fills uz and ru for every translatable field and leaves en', async () => {
    const p = await mkProduct()
    await prisma.specLabel.createMany({
      data: [
        { key: 'general', label: { en: 'General' } },
        { key: 'max-output', label: { en: 'Max output' } },
      ],
    })
    const r = await translateProduct(p.id, { translator: fake })
    expect(r.status).toBe('done')
    expect(r.translated).toBeGreaterThan(0)
    const q = await reload(p.id)
    const title = q.title as Record<string, string>
    expect(title).toEqual({ en: 'Laptop Charger Pro', uz: '[uz] Laptop Charger Pro', ru: '[ru] Laptop Charger Pro' })
    expect((q.subtitle as any).uz).toBe('[uz] Fast charging')
    expect((q.shortSpec as any).ru).toBe('[ru] 100W Max')
    const sec = (q.sections as any)[0]
    expect(sec.heading).toEqual({ en: 'Compact', uz: '[uz] Compact', ru: '[ru] Compact' })
    expect(sec.body.uz).toBe('[uz] Small body')
    const hl = (q.highlights as any)[0]
    expect(hl.title.ru).toBe('[ru] Safe charging')
    expect(hl.value).toBe('100W')
    expect((q.inTheBox as any)[1]).toEqual({ en: 'Cable', uz: '[uz] Cable', ru: '[ru] Cable' })
    const faq = (q.faq as any)[0]
    expect(faq.q.uz).toBe('[uz] Is it safe?')
    expect(faq.a.ru).toBe('[ru] Yes it is')
    expect((q.variants[0].name as any)).toEqual({ en: 'Iron Gray', uz: '[uz] Iron Gray', ru: '[ru] Iron Gray' })
    const labels = await prisma.specLabel.findMany({ orderBy: { key: 'asc' } })
    expect(labels.map((l) => l.label)).toEqual([
      { en: 'General', uz: '[uz] General', ru: '[ru] General' },
      { en: 'Max output', uz: '[uz] Max output', ru: '[ru] Max output' },
    ])
  })

  it('leaves unit-only / numeric spec values untouched, translates real words', async () => {
    const p = await mkProduct()
    await translateProduct(p.id, { translator: fake })
    const items = ((await reload(p.id)).specs as any)[0].items
    expect(items[0].valueL10n).toBeUndefined() // 100W
    expect(items[1].valueL10n).toBeUndefined() // USB-C
    expect(items[2].valueL10n).toEqual({ uz: '[uz] Fire-retardant plastic', ru: '[ru] Fire-retardant plastic' })
  })

  it('reviewed.uz stays untouched while stale ru is overwritten', async () => {
    const p = await mkProduct({
      title: { en: 'New title', uz: 'Qoʻlda tuzatilgan', ru: 'Старый заголовок' },
      reviewed: { uz: true, ru: false },
    })
    await translateProduct(p.id, { translator: fake })
    const title = (await reload(p.id)).title as Record<string, string>
    expect(title.uz).toBe('Qoʻlda tuzatilgan')
    expect(title.ru).toBe('[ru] New title')
    expect(title.en).toBe('New title')
  })

  it('force overwrites reviewed locales', async () => {
    const p = await mkProduct({
      title: { en: 'T', uz: 'manual', ru: 'ручной' },
      reviewed: { uz: true, ru: true },
    })
    await translateProduct(p.id, { translator: fake })
    expect(((await reload(p.id)).title as any).uz).toBe('manual')
    await translateProduct(p.id, { translator: fake, force: true })
    const t = (await reload(p.id)).title as any
    expect(t.uz).toBe('[uz] T')
    expect(t.ru).toBe('[ru] T')
  })

  it('length mismatch throws TranslationError and writes nothing', async () => {
    const p = await mkProduct()
    await prisma.specLabel.create({ data: { key: 'general', label: { en: 'General' } } })
    const before = JSON.stringify(await reload(p.id))
    const bad: Translator = {
      async translate(texts, to) {
        const out = texts.map((s) => `[${to}] ${s}`)
        return to === 'ru' ? out.slice(1) : out // uz succeeds, ru is short
      },
    }
    await expect(translateProduct(p.id, { translator: bad })).rejects.toBeInstanceOf(TranslationError)
    expect(JSON.stringify(await reload(p.id))).toBe(before)
    expect((await prisma.specLabel.findUniqueOrThrow({ where: { key: 'general' } })).label).toEqual({ en: 'General' })
  })

  it('translator error is wrapped in TranslationError and nothing is written', async () => {
    const p = await mkProduct()
    const before = JSON.stringify(await reload(p.id))
    const boom: Translator = {
      async translate() {
        throw new Error('network down')
      },
    }
    await expect(translateProduct(p.id, { translator: boom })).rejects.toBeInstanceOf(TranslationError)
    expect(JSON.stringify(await reload(p.id))).toBe(before)
  })

  describe('without a key', () => {
    beforeEach(() => vi.stubEnv('ANTHROPIC_API_KEY', ''))
    afterEach(() => vi.unstubAllEnvs())
    it('returns not_configured and writes nothing', async () => {
      const p = await mkProduct()
      const before = JSON.stringify(await reload(p.id))
      expect(isTranslationConfigured()).toBe(false)
      expect(getTranslator()).toBeNull()
      expect(await translateProduct(p.id)).toEqual({ status: 'not_configured', translated: 0 })
      expect(JSON.stringify(await reload(p.id))).toBe(before)
    })
    it('configured when key present', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
      expect(isTranslationConfigured()).toBe(true)
      expect(getTranslator()).toBeInstanceOf(ClaudeTranslator)
    })
  })

  it('translated HTML is sanitized before saving and tags survive', async () => {
    const p = await mkProduct()
    const evil: Translator = {
      async translate(texts, to) {
        return texts.map((s) =>
          s.startsWith('<p') ? `<p onclick="x()">[${to}] <strong>tez</strong></p><script>alert(2)</script><a href="javascript:evil()">l</a>` : `[${to}] ${s}`,
        )
      },
    }
    await translateProduct(p.id, { translator: evil })
    const d = (await reload(p.id)).descriptionHtml as any
    expect(d.uz).toContain('<strong>tez</strong>')
    expect(d.uz).not.toMatch(/script|onclick|javascript:/)
    // the EN source is not rewritten
    expect(d.en).toContain('class="x"')
  })

  it('translator receives the sanitized-or-raw EN HTML intact (tags/attributes)', async () => {
    const p = await mkProduct()
    const seen: string[] = []
    await translateProduct(p.id, {
      translator: {
        async translate(texts, to) {
          seen.push(...texts)
          return texts.map((s) => `[${to}] ${s}`)
        },
      },
    })
    expect(seen.some((s) => s.includes('<strong>fast</strong>'))).toBe(true)
  })
})

describe('translateUiMissing', () => {
  const messages = {
    en: { a: { x: 'Hello', y: 'Cart' }, z: 'Total {count}' },
    uz: { a: { x: 'Salom', y: '' } },
    ru: { a: { x: 'Привет' } },
  }
  it('fills only missing keys, respecting UiString overrides', async () => {
    await prisma.uiString.create({ data: { key: 'a.y', value: { ru: 'Корзина' } } })
    const r = await translateUiMissing({ translator: fake, messages })
    expect(r.status).toBe('done')
    // uz missing: a.y, z ; ru missing: z (a.y overridden)
    expect(r.translated).toBe(3)
    const rows = Object.fromEntries((await prisma.uiString.findMany()).map((u) => [u.key, u.value]))
    expect(rows['a.y']).toEqual({ ru: 'Корзина', uz: '[uz] Cart' })
    expect(rows['z']).toEqual({ uz: '[uz] Total {count}', ru: '[ru] Total {count}' })
    expect(rows['a.x']).toBeUndefined()
  })
  it('is a no-op when nothing is missing, and not_configured without translator', async () => {
    const full = { en: { k: 'K' }, uz: { k: 'К1' }, ru: { k: 'К2' } }
    expect(await translateUiMissing({ translator: fake, messages: full })).toEqual({ status: 'done', translated: 0 })
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    expect(await translateUiMissing({ messages })).toEqual({ status: 'not_configured', translated: 0 })
    vi.unstubAllEnvs()
    expect(await prisma.uiString.count()).toBe(0)
  })
  it('mismatch writes nothing', async () => {
    const bad: Translator = { translate: async (t) => t.slice(1) }
    await expect(translateUiMissing({ translator: bad, messages })).rejects.toBeInstanceOf(TranslationError)
    expect(await prisma.uiString.count()).toBe(0)
  })
})

describe('ClaudeTranslator', () => {
  function fakeClient(reply: (texts: string[]) => unknown, calls: any[] = []) {
    return {
      calls,
      messages: {
        create: async (req: any) => {
          calls.push(req)
          const texts = JSON.parse(req.messages[0].content) as string[]
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ translations: reply(texts) }) }] }
        },
      },
    }
  }
  it('batches at most 40 strings per request and keeps order', async () => {
    const c = fakeClient((t) => t.map((s) => `~${s}`))
    const tr = new ClaudeTranslator({ client: c as never })
    const input = Array.from({ length: 95 }, (_, i) => `s${i}`)
    const out = await tr.translate(input, 'uz')
    expect(out).toEqual(input.map((s) => `~${s}`))
    expect(c.calls.map((x) => JSON.parse(x.messages[0].content).length)).toEqual([40, 40, 15])
    expect(c.calls[0].model).toBe('claude-haiku-5-5')
    expect(c.calls[0].system).toMatch(/Uzbek/)
    expect(c.calls[0].system).toContain('ʻ')
  })
  it('mismatched array length throws TranslationError', async () => {
    const tr = new ClaudeTranslator({ client: fakeClient((t) => t.slice(1)) as never })
    await expect(tr.translate(['a', 'b'], 'ru')).rejects.toBeInstanceOf(TranslationError)
  })
  it('refusal / max_tokens / non-JSON throw TranslationError (valid JSON, so only stop_reason can fail)', async () => {
    const valid = [{ type: 'text', text: JSON.stringify({ translations: ['x'] }) }]
    const cases: [unknown, RegExp][] = [
      [{ stop_reason: 'refusal', content: valid }, /refused/],
      [{ stop_reason: 'max_tokens', content: valid }, /cut off|too long/],
      [{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'nope' }] }, /invalid JSON|too long/],
    ]
    for (const [resp, re] of cases) {
      const tr = new ClaudeTranslator({ client: { messages: { create: async () => resp } } as never })
      await expect(tr.translate(['a'], 'uz')).rejects.toThrow(re)
      await expect(tr.translate(['a'], 'uz')).rejects.toBeInstanceOf(TranslationError)
    }
  })
  it('a batch cut off at max_tokens is split in half and retried', async () => {
    const calls: string[][] = []
    const client = {
      messages: {
        create: async (req: any) => {
          const texts = JSON.parse(req.messages[0].content) as string[]
          calls.push(texts)
          const ok = JSON.stringify({ translations: texts.map((s) => `~${s}`) })
          return { stop_reason: texts.length > 1 ? 'max_tokens' : 'end_turn', content: [{ type: 'text', text: ok }] }
        },
      },
    }
    const out = await new ClaudeTranslator({ client: client as never }).translate(['a', 'b', 'c'], 'ru')
    expect(out).toEqual(['~a', '~b', '~c'])
    expect(calls.map((c) => c.length)).toEqual([3, 1, 2, 1, 1])
  })
  it('a single HTML string that still overflows is split at top-level blocks and joined', async () => {
    const html = '<h2>Title</h2>\n<p>One <b>bold</b></p><ul><li>x</li><li>y</li></ul><p>Two</p>'
    const client = {
      messages: {
        create: async (req: any) => {
          const texts = JSON.parse(req.messages[0].content) as string[]
          const tooLong = texts.some((s) => s.length > 30)
          return { stop_reason: tooLong ? 'max_tokens' : 'end_turn', content: [{ type: 'text', text: JSON.stringify({ translations: texts.map((s) => s.toUpperCase()) }) }] }
        },
      },
    }
    const out = await new ClaudeTranslator({ client: client as never }).translate([html], 'uz')
    expect(out).toEqual([html.toUpperCase()])
  })
  it('an unsplittable string that keeps overflowing throws TranslationError', async () => {
    const client = { messages: { create: async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"translations":["x"]}' }] }) } }
    await expect(new ClaudeTranslator({ client: client as never }).translate(['<p>only one block</p>'], 'uz')).rejects.toBeInstanceOf(TranslationError)
  })
  it('uses a char cap of ~7000 per request and max_tokens within the non-streaming limit', async () => {
    const c = fakeClient((t) => t)
    const s = 'x'.repeat(3000)
    await new ClaudeTranslator({ client: c as never }).translate([s, s, s], 'uz')
    expect(c.calls.map((x) => JSON.parse(x.messages[0].content).length)).toEqual([2, 1])
    expect(c.calls[0].max_tokens).toBeGreaterThanOrEqual(16000)
    expect(c.calls[0].max_tokens).toBeLessThanOrEqual(21000)
  })
  it('empty input makes no request', async () => {
    const c = fakeClient((t) => t)
    expect(await new ClaudeTranslator({ client: c as never }).translate([], 'uz')).toEqual([])
    expect(c.calls).toHaveLength(0)
  })
})

describe('translateUiMissing ICU placeholder validation', () => {
  const mk = (en: string) => ({ en: { k: en }, uz: {}, ru: {} })
  const run = (en: string, f: (s: string, to: string) => string) =>
    translateUiMissing({ translator: { translate: async (t, to) => t.map((s) => f(s, to)) }, messages: mk(en) })

  it('translator dropping {count} -> TranslationError and UiString unchanged', async () => {
    await expect(run('{count} items', (s, to) => `[${to}] elementlar`)).rejects.toBeInstanceOf(TranslationError)
    expect(await prisma.uiString.count()).toBe(0)
  })
  it('renamed or extra placeholder is rejected too', async () => {
    await expect(run('Hi {name}', (s, to) => `[${to}] Salom {ism}`)).rejects.toBeInstanceOf(TranslationError)
    await expect(run('Hi {name}', (s, to) => `[${to}] Salom {name} {x}`)).rejects.toBeInstanceOf(TranslationError)
    expect(await prisma.uiString.count()).toBe(0)
  })
  it('unparseable ICU output is rejected', async () => {
    await expect(run('Hi {name}', (s, to) => `[${to}] Salom {name`)).rejects.toBeInstanceOf(TranslationError)
    expect(await prisma.uiString.count()).toBe(0)
  })
  it('one bad string rejects the whole batch', async () => {
    const messages = { en: { a: 'Hello', b: 'Total {count}' }, uz: {}, ru: {} }
    const tr = { translate: async (t: string[], to: string) => t.map((s) => (s.includes('{') ? 'Jami' : `[${to}] ${s}`)) }
    await expect(translateUiMissing({ translator: tr, messages })).rejects.toBeInstanceOf(TranslationError)
    expect(await prisma.uiString.count()).toBe(0)
  })
  it('placeholders kept -> stored', async () => {
    const r = await run('Total {count}, {name}', (s, to) => `${to}: ${s}`)
    expect(r.translated).toBe(2)
    expect((await prisma.uiString.findUniqueOrThrow({ where: { key: 'k' } })).value).toEqual({
      uz: 'uz: Total {count}, {name}',
      ru: 'ru: Total {count}, {name}',
    })
  })
  it('plural block: arguments kept (ru may use few/many) -> stored; dropped argument -> rejected', async () => {
    const en = '{count, plural, one {# item} other {# items}}'
    const ruPlural = '{count, plural, one {# товар} few {# товара} many {# товаров} other {# товара}}'
    await run(en, (s, to) => (to === 'ru' ? ruPlural : '{count, plural, one {# mahsulot} other {# mahsulot}}'))
    expect((await prisma.uiString.findUniqueOrThrow({ where: { key: 'k' } })).value).toEqual({
      uz: '{count, plural, one {# mahsulot} other {# mahsulot}}',
      ru: ruPlural,
    })
    await prisma.uiString.deleteMany()
    await expect(run(en, () => '{n, plural, one {# x} other {# x}}')).rejects.toBeInstanceOf(TranslationError)
    expect(await prisma.uiString.count()).toBe(0)
  })
})
