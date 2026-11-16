import { describe, it, expect, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { createCategory, updateCategory } from '@/lib/admin/categories'
import { maskToken, saveSettings, getSettingsView, sendTestMessage } from '@/lib/admin/settings'
import { saveUiStrings, listUiRows, saveSpecLabels, listSpecLabels } from '@/lib/admin/translations'
import { runImport } from '@/lib/admin/import'
import { ImportError } from '@/lib/importer/anker'
import { TranslationError } from '@/lib/translate'
import { getSettings } from '@/lib/settings'
import { listOrders, orderCounts } from '@/lib/admin/orders'

describe('categories', () => {
  const base = { slug: 'audio', name: { en: 'Audio' }, parentId: null, sortOrder: 1, template: 'SIMPLE' as const }
  it('creates, rejects duplicate/bad slug, nameless, bad template', async () => {
    const a = await createCategory(base)
    expect(a.ok).toBe(true)
    expect(await createCategory(base)).toMatchObject({ ok: false, errors: { slug: expect.any(String) } })
    expect(await createCategory({ ...base, slug: 'Bad Slug' })).toMatchObject({ ok: false })
    expect(await createCategory({ ...base, slug: 'x', name: {} })).toMatchObject({ ok: false, errors: { name: expect.any(String) } })
    expect(await createCategory({ ...base, slug: 'y', template: 'WEIRD' as never })).toMatchObject({ ok: false })
  })
  it('update prevents cycles and self-parent', async () => {
    const a = (await createCategory(base)) as { id: number }
    const b = (await createCategory({ ...base, slug: 'b', parentId: a.id })) as { id: number }
    expect(await updateCategory(a.id, { ...base, parentId: b.id })).toMatchObject({ ok: false, errors: { parentId: expect.any(String) } })
    expect(await updateCategory(a.id, { ...base, parentId: a.id })).toMatchObject({ ok: false })
    expect(await updateCategory(b.id, { ...base, slug: 'b', name: { uz: 'B', en: 'B' }, template: 'DETAILED' })).toMatchObject({ ok: true })
    expect((await prisma.category.findUniqueOrThrow({ where: { id: b.id } })).template).toBe('DETAILED')
  })
})

describe('settings', () => {
  it('masks tokens and never returns the full one', async () => {
    expect(maskToken(null)).toBe('')
    expect(maskToken('123456789:ABCDEFGHIJKLMNOPQRSTUV')).not.toContain('ABCDEFGHIJ')
    const token = '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    expect(await saveSettings({ minOrderUzs: 100000, telegramBotToken: token, telegramChatId: '-100123' })).toEqual({ ok: true })
    const view = await getSettingsView()
    expect(JSON.stringify(view)).not.toContain(token)
    expect(view).toMatchObject({ minOrderUzs: 100000, telegramTokenSet: true, telegramChatId: '-100123' })
    // blank token keeps the stored one
    await saveSettings({ minOrderUzs: 5, telegramBotToken: '', telegramChatId: '-100123' })
    expect((await getSettings()).telegramBotToken).toBe(token)
    await saveSettings({ minOrderUzs: 5, clearTelegramToken: true, telegramChatId: '' })
    expect(await getSettings()).toMatchObject({ telegramBotToken: null, telegramChatId: null })
  })
  it('validates', async () => {
    expect(await saveSettings({ minOrderUzs: -1, telegramChatId: '' })).toMatchObject({ ok: false, errors: { minOrderUzs: expect.any(String) } })
    expect(await saveSettings({ minOrderUzs: 1.5, telegramChatId: '' })).toMatchObject({ ok: false })
    expect(await saveSettings({ minOrderUzs: 1, telegramBotToken: 'nope', telegramChatId: '' })).toMatchObject({ ok: false })
    expect(await saveSettings({ minOrderUzs: 1, telegramChatId: 'abc def' })).toMatchObject({ ok: false })
  })
  it('test message: skipped when unconfigured, sent/failed via telegram', async () => {
    expect(await sendTestMessage()).toBe('skipped')
    await saveSettings({ minOrderUzs: 0, telegramBotToken: '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ', telegramChatId: '-1' })
    const ok = vi.fn(async () => new Response('{}', { status: 200 }))
    expect(await sendTestMessage(ok as never)).toBe('sent')
    expect(await sendTestMessage((async () => new Response('x', { status: 400 })) as never)).toBe('failed')
  })
})

describe('ui strings and spec labels', () => {
  it('lists keys and stores only real overrides; clearing removes them', async () => {
    const rows = await listUiRows()
    const cart = rows.find((r) => r.key === 'nav.cart')!
    expect(cart.en).toBeTruthy()
    expect(await saveUiStrings([{ key: 'nav.cart', values: { uz: 'Savatcha X', ru: cart.ru } }])).toMatchObject({ ok: true })
    const stored = await prisma.uiString.findUniqueOrThrow({ where: { key: 'nav.cart' } })
    expect(stored.value).toEqual({ uz: 'Savatcha X' }) // ru equals file value -> not stored
    expect((await listUiRows()).find((r) => r.key === 'nav.cart')!.uz).toBe('Savatcha X')
    await saveUiStrings([{ key: 'nav.cart', values: { uz: '' } }])
    expect(await prisma.uiString.count()).toBe(0)
  })
  it('rejects unknown keys and placeholder mismatches without writing', async () => {
    expect(await saveUiStrings([{ key: 'no.such.key', values: { uz: 'x' } }])).toMatchObject({ ok: false })
    const withArg = (await listUiRows()).find((r) => /\{\w+\}/.test(r.en))
    if (withArg) {
      expect(await saveUiStrings([{ key: withArg.key, values: { uz: 'no placeholder here' } }])).toMatchObject({ ok: false })
      expect(await prisma.uiString.count()).toBe(0)
    }
  })
  it('spec labels upsert', async () => {
    await saveSpecLabels([{ key: 'weight', label: { en: 'Weight', uz: ' Vazn ', ru: '' } }])
    expect(await listSpecLabels()).toEqual([{ key: 'weight', label: { en: 'Weight', uz: 'Vazn' } }])
    expect(await saveSpecLabels([{ key: ' ', label: {} }])).toMatchObject({ ok: false })
  })
})

describe('runImport', () => {
  const imp = (created: boolean) => vi.fn(async () => ({ productId: 7, created }))
  it('existing product: no translation, created false', async () => {
    const translate = vi.fn()
    expect(await runImport('u', undefined, { importProduct: imp(false), translate })).toEqual({ ok: true, productId: 7, created: false })
    expect(translate).not.toHaveBeenCalled()
  })
  it('created + translated', async () => {
    const translate = vi.fn(async () => ({ status: 'done' as const, translated: 3 }))
    expect(await runImport('u', 2, { importProduct: imp(true), translate })).toMatchObject({ ok: true, created: true, translation: 'done' })
  })
  it('translation not configured / failing is non-fatal with a notice', async () => {
    const nc = await runImport('u', 2, { importProduct: imp(true), translate: async () => ({ status: 'not_configured', translated: 0 }) })
    expect(nc).toMatchObject({ ok: true, productId: 7, translation: 'not_configured', notice: expect.stringContaining('not configured') })
    const bad = await runImport('u', 2, { importProduct: imp(true), translate: async () => { throw new TranslationError('rate limited') } })
    expect(bad).toMatchObject({ ok: true, translation: 'failed', notice: expect.stringContaining('rate limited') })
  })
  it('maps ImportError codes to human text', async () => {
    for (const code of ['BAD_URL', 'FETCH_FAILED', 'NOT_FOUND', 'PARSE_FAILED'] as const) {
      const r = await runImport('u', 2, { importProduct: async () => { throw new ImportError(code) }, translate: vi.fn() })
      expect(r).toMatchObject({ ok: false, code })
      expect((r as { message: string }).message).not.toBe(code)
    }
  })
})

describe('admin orders queries', () => {
  it('filters and counts', async () => {
    const mk = (number: number, status: string) =>
      prisma.order.create({ data: { number, status, name: 'n', phone: 'p', region: 'r', address: 'a', locale: 'uz', totalUzs: 1 } })
    await mk(1001, 'NEW')
    await mk(1002, 'CONFIRMED')
    await mk(1003, 'NEW')
    expect((await listOrders()).map((o) => o.number)).toEqual([1003, 1002, 1001])
    expect((await listOrders('NEW')).map((o) => o.number)).toEqual([1003, 1001])
    expect((await listOrders('BOGUS')).length).toBe(3)
    expect(await orderCounts()).toEqual({ ALL: 3, NEW: 2, CONFIRMED: 1, DELIVERED: 0, CANCELLED: 0 })
  })
})
