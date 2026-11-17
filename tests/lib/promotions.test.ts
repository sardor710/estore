import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import { categoryAncestry, getActiveRules, priceTargetFor } from '@/lib/promotions'
import { deletePromotion, listPromotions, savePromotion, togglePromotion, type PromotionInput } from '@/lib/admin/promotions'
import { deleteBrand, listBrands, saveBrand, upsertBrandByName } from '@/lib/admin/brands'
import type { Staff } from '@/lib/admin/session'

const actor: Staff = { id: 0, email: 'pm@test', name: 'PM', role: 'PRODUCT_MANAGER' }

async function tree() {
  const root = await prisma.category.create({ data: { slug: 'audio', name: { en: 'Audio' } } })
  const mid = await prisma.category.create({ data: { slug: 'headphones', parentId: root.id, name: { en: 'Headphones' } } })
  const leaf = await prisma.category.create({ data: { slug: 'tws', parentId: mid.id, name: { en: 'TWS' } } })
  return { root, mid, leaf }
}

async function mkProduct(categoryId: number, slug = 'p1', brandId: number | null = null) {
  return prisma.product.create({
    data: {
      slug, categoryId, brandId, status: 'PUBLISHED', title: { en: slug }, subtitle: {}, shortSpec: {}, descriptionHtml: {}, sections: [], highlights: [],
      inTheBox: [], faq: [], specs: [], images: [], reviewed: { uz: false, ru: false },
      variants: { create: [{ sku: `${slug}-1`, name: { en: 'v' }, priceUzs: 100_000, stock: 1 }] },
    },
  })
}

const input = (o: Partial<PromotionInput> = {}): PromotionInput => ({
  name: 'Black Friday', kind: 'PERCENT', value: 15, targetType: 'CATEGORY', targetIds: [], enabled: true, startsAt: null, endsAt: null, ...o,
})

describe('pricing data', () => {
  it('categoryAncestry lists own id then ancestors; priceTargetFor uses it', async () => {
    const { root, mid, leaf } = await tree()
    const anc = await categoryAncestry()
    expect(anc.get(leaf.id)).toEqual([leaf.id, mid.id, root.id])
    expect(anc.get(root.id)).toEqual([root.id])
    expect(priceTargetFor({ priceUzs: 5000, product: { id: 9, categoryId: leaf.id, brandId: 2 } }, anc)).toEqual({
      priceUzs: 5000, productId: 9, categoryIds: [leaf.id, mid.id, root.id], brandId: 2,
    })
  })
  it('getActiveRules returns only enabled rules inside their window', async () => {
    const now = new Date('2026-11-17T12:00:00Z')
    const mk = (name: string, data: object) =>
      prisma.promotion.create({ data: { name, kind: 'AMOUNT', value: 1000, targetType: 'PRODUCT', targetIds: [1, 2], ...data } })
    const live = await mk('live', { startsAt: new Date('2026-11-01'), endsAt: new Date('2026-12-01') })
    await mk('off', { enabled: false })
    await mk('future', { startsAt: new Date('2026-11-18') })
    await mk('past', { endsAt: now })
    const rules = await getActiveRules(now)
    expect(rules.map((r) => r.id)).toEqual([live.id])
    expect(rules[0]).toMatchObject({ kind: 'AMOUNT', targetType: 'PRODUCT', targetIds: [1, 2] })
  })
})

describe('admin promotions', () => {
  it('validates value range, targets and dates', async () => {
    const { root } = await tree()
    expect(await savePromotion(input({ targetIds: [] }), actor)).toMatchObject({ ok: false })
    expect(await savePromotion(input({ targetIds: [root.id], value: 0 }), actor)).toMatchObject({ ok: false })
    expect(await savePromotion(input({ targetIds: [root.id], value: 91 }), actor)).toMatchObject({ ok: false })
    expect(await savePromotion(input({ targetIds: [root.id], kind: 'AMOUNT', value: 0 }), actor)).toMatchObject({ ok: false })
    expect(await savePromotion(input({ targetIds: [424242] }), actor)).toMatchObject({ ok: false })
    expect(await savePromotion(input({ targetIds: [root.id], name: '  ' }), actor)).toMatchObject({ ok: false })
    expect(
      await savePromotion(input({ targetIds: [root.id], startsAt: '2026-11-20T10:00', endsAt: '2026-11-20T10:00' }), actor),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/end/i) })
    expect(await prisma.promotion.count()).toBe(0)
    expect(await prisma.activityLog.count()).toBe(0)
  })

  it('creates (dates in Tashkent time), updates, toggles and deletes with activity log', async () => {
    const { root } = await tree()
    const r = await savePromotion(input({ targetIds: [root.id], startsAt: '2026-11-20T10:00', endsAt: '2026-11-30T00:00' }), actor)
    expect(r).toMatchObject({ ok: true })
    const id = (r as { id: number }).id
    const row = await prisma.promotion.findUniqueOrThrow({ where: { id } })
    expect(row.startsAt!.toISOString()).toBe('2026-11-20T05:00:00.000Z')
    expect(row.targetIds).toEqual([root.id])

    expect(await savePromotion(input({ id, targetIds: [root.id], kind: 'AMOUNT', value: 50_000 }), actor)).toEqual({ ok: true, id })
    expect((await prisma.promotion.findUniqueOrThrow({ where: { id } })).startsAt).toBeNull()
    expect(await togglePromotion(id, false, actor)).toEqual({ ok: true })
    expect((await prisma.promotion.findUniqueOrThrow({ where: { id } })).enabled).toBe(false)
    expect(await deletePromotion(id, actor)).toEqual({ ok: true })
    expect(await prisma.promotion.count()).toBe(0)
    expect(await deletePromotion(id, actor)).toMatchObject({ ok: false })

    const log = await prisma.activityLog.findMany({ orderBy: { id: 'asc' } })
    expect(log.map((l) => [l.action, l.entity, l.entityId])).toEqual([
      ['create', 'promotion', String(id)],
      ['update', 'promotion', String(id)],
      ['update', 'promotion', String(id)],
      ['delete', 'promotion', String(id)],
    ])
  })

  it('lists with state and a target summary', async () => {
    const { root, mid } = await tree()
    const now = new Date('2026-11-17T12:00:00Z')
    const mk = (name: string, data: object) =>
      prisma.promotion.create({ data: { name, kind: 'PERCENT', value: 10, targetType: 'CATEGORY', targetIds: [root.id, mid.id], ...data } })
    await mk('a', {})
    await mk('s', { startsAt: new Date('2026-11-18') })
    await mk('e', { endsAt: new Date('2026-11-17T11:00:00Z') })
    await mk('o', { enabled: false })
    const rows = await listPromotions(now)
    expect(Object.fromEntries(rows.map((r) => [r.name, r.state]))).toEqual({ a: 'active', s: 'scheduled', e: 'expired', o: 'off' })
    expect(rows.find((r) => r.name === 'a')!.targetSummary).toBe('Categories: Audio, Headphones')
  })
})

describe('admin brands', () => {
  it('upsertBrandByName collapses case and whitespace', async () => {
    const a = await upsertBrandByName(' Anker ')
    const b = await upsertBrandByName('anker')
    expect(b).toBe(a)
    expect(await prisma.brand.findMany()).toMatchObject([{ id: a, name: 'Anker', slug: 'anker' }])
  })

  it('lists with product counts, validates, refuses deleting a brand in use', async () => {
    const { root } = await tree()
    const r = await saveBrand({ name: 'Soundcore', slug: '', logoUrl: '', sortOrder: 1 }, actor)
    expect(r).toMatchObject({ ok: true })
    const id = (r as { id: number }).id
    expect((await prisma.brand.findUniqueOrThrow({ where: { id } })).slug).toBe('soundcore')
    expect(await saveBrand({ name: 'SOUNDCORE', slug: 'other', logoUrl: '', sortOrder: 0 }, actor)).toMatchObject({ ok: false })
    expect(await saveBrand({ name: 'X', slug: 'Bad Slug', logoUrl: '', sortOrder: 0 }, actor)).toMatchObject({ ok: false })
    expect(await saveBrand({ name: 'X', slug: '', logoUrl: 'javascript:alert(1)', sortOrder: 0 }, actor)).toMatchObject({ ok: false })
    expect(await saveBrand({ name: 'X', slug: '', logoUrl: '/uploads/../.env', sortOrder: 0 }, actor)).toMatchObject({ ok: false })
    expect(await saveBrand({ name: 'X', slug: '', logoUrl: '/uploads/2026/11/a..b/../x.png', sortOrder: 0 }, actor)).toMatchObject({ ok: false })
    expect(await prisma.brand.count()).toBe(1)

    await mkProduct(root.id, 'p1', id)
    expect((await listBrands()).map((b) => [b.name, b.productCount])).toEqual([['Soundcore', 1]])
    expect(await deleteBrand(id, actor)).toMatchObject({ ok: false })
    await prisma.product.deleteMany()
    expect(await deleteBrand(id, actor)).toEqual({ ok: true })
    expect((await prisma.activityLog.findMany()).map((l) => [l.action, l.entity])).toEqual([
      ['create', 'brand'],
      ['delete', 'brand'],
    ])
  })
})

describe('deleteBrand: BRAND promotions', () => {
  it('drops the id from BRAND promotions, switches off an emptied one and logs both', async () => {
    const a = await prisma.brand.create({ data: { name: 'A', slug: 'a' } })
    const b = await prisma.brand.create({ data: { name: 'B', slug: 'b' } })
    const both = await prisma.promotion.create({ data: { name: 'Both', kind: 'PERCENT', value: 5, targetType: 'BRAND', targetIds: [a.id, b.id] } })
    const only = await prisma.promotion.create({ data: { name: 'Only', kind: 'PERCENT', value: 5, targetType: 'BRAND', targetIds: [a.id] } })
    expect(await deleteBrand(a.id, actor)).toEqual({ ok: true })
    expect(await prisma.promotion.findUniqueOrThrow({ where: { id: both.id } })).toMatchObject({ targetIds: [b.id], enabled: true })
    expect(await prisma.promotion.findUniqueOrThrow({ where: { id: only.id } })).toMatchObject({ targetIds: [], enabled: false })
    expect(await prisma.activityLog.count({ where: { entity: 'promotion', action: 'update' } })).toBe(2)
  })
})
