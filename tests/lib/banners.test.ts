import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import type { Staff } from '@/lib/admin/session'
import { deleteBanner, isValidBannerLink, listBanners, reorderBanners, saveBanner, setBannerActive, type BannerInput } from '@/lib/admin/banners'
import { bannerHref, getActiveBanners } from '@/lib/banners'
import { path } from '@/lib/paths'

const ann: Staff = { id: 1, email: 'ann@shop.uz', name: 'Ann', role: 'ADMIN' }
const IMG = '/uploads/2026/11/ab12.jpg'
const base: BannerInput = {
  title: { uz: 'Zaryadkalar', en: 'Chargers' },
  text: { uz: 'Tez', en: 'Fast' },
  buttonText: { uz: 'Ko‘rish', en: 'Shop' },
  imageUrl: IMG,
  mobileImageUrl: '',
  linkUrl: '/c/chargers',
  active: true,
  startsAt: null,
  endsAt: null,
}
const errorsOf = (r: Awaited<ReturnType<typeof saveBanner>>) => (r.ok ? {} : r.errors)
const idOf = (r: Awaited<ReturnType<typeof saveBanner>>) => {
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.id
}

describe('saveBanner validation', () => {
  it('saves a valid banner with an uploaded image and logs it', async () => {
    const id = idOf(await saveBanner(base, ann))
    const row = await prisma.banner.findUniqueOrThrow({ where: { id } })
    expect(row.imageUrl).toBe(IMG)
    expect(row.linkUrl).toBe('/c/chargers')
    expect(await prisma.activityLog.count({ where: { entity: 'banner', action: 'create', entityId: String(id) } })).toBe(1)
  })
  it('requires an image and rejects unsafe image URLs', async () => {
    expect(errorsOf(await saveBanner({ ...base, imageUrl: '' }, ann))).toHaveProperty('imageUrl')
    expect(errorsOf(await saveBanner({ ...base, imageUrl: 'javascript:alert(1)' }, ann))).toHaveProperty('imageUrl')
    expect(errorsOf(await saveBanner({ ...base, mobileImageUrl: 'ftp://x/y.jpg' }, ann))).toHaveProperty('mobileImageUrl')
    expect((await saveBanner({ ...base, imageUrl: 'https://cdn.example.com/a.jpg' }, ann)).ok).toBe(true)
  })
  it.each(['javascript:alert(1)', '//evil.com', 'data:text/html,x', 'evil.com', '/\\evil.com'])('rejects link %s', async (linkUrl) => {
    expect(isValidBannerLink(linkUrl)).toBe(false)
    expect(errorsOf(await saveBanner({ ...base, linkUrl }, ann))).toHaveProperty('linkUrl')
  })
  it.each(['', '/c/chargers', '/ru/sale', 'https://x.uz', 'http://x.uz/a?b=1'])('accepts link "%s"', (linkUrl) => {
    expect(isValidBannerLink(linkUrl)).toBe(true)
  })
  it('rejects whitespace in image URLs (srcset injection) and links', async () => {
    expect(errorsOf(await saveBanner({ ...base, mobileImageUrl: 'https://cdn.example.com/a.jpg 2x, https://tracker.example/p.gif 1x' }, ann))).toHaveProperty('mobileImageUrl')
    expect(errorsOf(await saveBanner({ ...base, imageUrl: 'https://cdn.example.com/a b.jpg' }, ann))).toHaveProperty('imageUrl')
    expect(isValidBannerLink('https://x.uz/a b')).toBe(false)
  })
  it('malformed payloads (crafted action calls) get field errors, not exceptions', async () => {
    const bad = { ...base, imageUrl: 5, mobileImageUrl: {}, linkUrl: 7, startsAt: 9, endsAt: [] } as unknown as BannerInput
    const e = errorsOf(await saveBanner(bad, ann))
    expect(e).toHaveProperty('imageUrl')
    expect(await reorderBanners('1,2' as unknown as number[], ann)).toMatchObject({ ok: false })
    expect(await reorderBanners([1.5] as number[], ann)).toMatchObject({ ok: false })
  })
  it('end must be after start', async () => {
    const r = await saveBanner({ ...base, startsAt: '2026-12-01T00:00:00.000Z', endsAt: '2026-12-01T00:00:00.000Z' }, ann)
    expect(errorsOf(r)).toHaveProperty('endsAt')
    expect(errorsOf(await saveBanner({ ...base, startsAt: 'not a date' }, ann))).toHaveProperty('startsAt')
  })
  it('limits text lengths per locale', async () => {
    expect(errorsOf(await saveBanner({ ...base, title: { uz: 'x'.repeat(121) } }, ann))).toHaveProperty('title')
    expect(errorsOf(await saveBanner({ ...base, text: { ru: 'x'.repeat(301) } }, ann))).toHaveProperty('text')
    expect(errorsOf(await saveBanner({ ...base, buttonText: { en: 'x'.repeat(41) } }, ann))).toHaveProperty('buttonText')
    expect((await saveBanner({ ...base, title: { uz: 'x'.repeat(120) } }, ann)).ok).toBe(true)
  })
  it('allows a banner with no text at all (image-only slide)', async () => {
    expect((await saveBanner({ ...base, title: {}, text: {}, buttonText: {}, linkUrl: '' }, ann)).ok).toBe(true)
  })
  it('updates an existing banner, rejects unknown id', async () => {
    const id = idOf(await saveBanner(base, ann))
    idOf(await saveBanner({ ...base, id, title: { uz: 'Yangi' } }, ann))
    expect((await prisma.banner.findUniqueOrThrow({ where: { id } })).title).toEqual({ uz: 'Yangi' })
    expect(errorsOf(await saveBanner({ ...base, id: 99999 }, ann))).toHaveProperty('form')
  })
})

describe('order, state and lifecycle', () => {
  it('new banners go last; reorder rewrites sortOrder; list reports state', async () => {
    const a = idOf(await saveBanner(base, ann))
    const b = idOf(await saveBanner(base, ann))
    expect((await listBanners()).map((r) => r.id)).toEqual([a, b])
    expect(await reorderBanners([b, a], ann)).toEqual({ ok: true })
    expect((await listBanners()).map((r) => r.id)).toEqual([b, a])
    expect(await reorderBanners([b], ann)).toMatchObject({ ok: false })

    const now = new Date('2026-11-17T12:00:00Z')
    idOf(await saveBanner({ ...base, id: a, startsAt: '2026-12-01T00:00:00.000Z' }, ann))
    expect((await listBanners(now)).find((r) => r.id === a)?.state).toBe('scheduled')
    idOf(await saveBanner({ ...base, id: a, startsAt: null, endsAt: '2026-11-01T00:00:00.000Z' }, ann))
    expect((await listBanners(now)).find((r) => r.id === a)?.state).toBe('expired')
    await setBannerActive(b, false, ann)
    expect((await listBanners(now)).find((r) => r.id === b)?.state).toBe('off')
  })
  it('delete removes and logs', async () => {
    const a = idOf(await saveBanner(base, ann))
    expect(await deleteBanner(a, ann)).toEqual({ ok: true })
    expect(await prisma.banner.count()).toBe(0)
    expect(await deleteBanner(a, ann)).toMatchObject({ ok: false })
    expect(await prisma.activityLog.count({ where: { entity: 'banner', action: 'delete' } })).toBe(1)
  })
})

describe('getActiveBanners', () => {
  const now = new Date('2026-11-17T12:00:00Z')
  it('only active banners inside their schedule, in order', async () => {
    const live = idOf(await saveBanner(base, ann))
    idOf(await saveBanner({ ...base, active: false }, ann))
    idOf(await saveBanner({ ...base, startsAt: '2026-11-18T00:00:00.000Z' }, ann))
    idOf(await saveBanner({ ...base, endsAt: '2026-11-17T11:59:59.000Z' }, ann))
    const windowed = idOf(await saveBanner({ ...base, startsAt: '2026-11-17T00:00:00.000Z', endsAt: '2026-11-18T00:00:00.000Z' }, ann))
    expect((await getActiveBanners('uz', now)).map((b) => b.id)).toEqual([live, windowed])
    await reorderBanners([windowed, live, ...(await prisma.banner.findMany({ where: { id: { notIn: [live, windowed] } } })).map((b) => b.id)], ann)
    expect((await getActiveBanners('uz', now)).map((b) => b.id)).toEqual([windowed, live])
  })
  it('localizes with fallback locale -> uz -> en -> ru and builds hrefs', async () => {
    idOf(await saveBanner({ ...base, title: { uz: 'Salom', en: 'Hello' }, text: { en: 'Only en' }, buttonText: {} }, ann))
    const [ru] = await getActiveBanners('ru', now)
    expect(ru).toMatchObject({ title: 'Salom', text: 'Only en', buttonText: '', href: '/ru/c/chargers', imageUrl: IMG, mobileImageUrl: null })
    const [en] = await getActiveBanners('en', now)
    expect(en.title).toBe('Hello')
  })
})

describe('bannerHref', () => {
  it('prefixes internal paths once, keeps external, drops invalid', () => {
    expect(bannerHref('ru', '/c/x')).toBe('/ru/c/x')
    expect(bannerHref('ru', '/ru/c/x')).toBe('/ru/c/x')
    expect(bannerHref('ru', '/en/c/x')).toBe('/en/c/x')
    expect(bannerHref('uz', '/c/x')).toBe(path('uz', '/c/x'))
    expect(bannerHref('uz', '/')).toBe(path('uz', '/'))
    expect(bannerHref('ru', '/uzbekistan')).toBe('/ru/uzbekistan')
    expect(bannerHref('en', 'https://a.b')).toBe('https://a.b')
    expect(bannerHref('en', null)).toBeNull()
    expect(bannerHref('en', '')).toBeNull()
    expect(bannerHref('en', '//evil.com')).toBeNull()
    expect(bannerHref('en', 'javascript:alert(1)')).toBeNull()
  })
})
