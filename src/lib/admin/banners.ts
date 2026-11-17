import { prisma } from '@/lib/db'
import { locales } from '@/i18n/routing'
import type { L10n } from '@/lib/localized'
import { isValidBannerLink } from '@/lib/banner-link'
import { logActivity } from './activity'
import { cleanL10n, isProductImageUrl } from './products-shared'
import type { Staff } from './session'

export { isValidBannerLink } from '@/lib/banner-link'

/** Dates are ISO strings in UTC (the form converts from the browser's local time). */
export type BannerInput = {
  id?: number
  title: L10n
  text: L10n
  buttonText: L10n
  imageUrl: string
  mobileImageUrl: string
  linkUrl: string
  active: boolean
  startsAt: string | null
  endsAt: string | null
}
export type BannerState = 'live' | 'scheduled' | 'expired' | 'off'
export type BannerRow = Omit<BannerInput, 'id'> & { id: number; sortOrder: number; state: BannerState }
export type BannerResult = { ok: true; id: number } | { ok: false; errors: Record<string, string> }
type Simple = { ok: true } | { ok: false; error: string }

export const BANNER_LIMITS = { title: 120, text: 300, buttonText: 40 } as const

type Row = Awaited<ReturnType<typeof prisma.banner.findFirstOrThrow>>

function stateOf(b: Pick<Row, 'active' | 'startsAt' | 'endsAt'>, now: Date): BannerState {
  if (!b.active) return 'off'
  if (b.endsAt && b.endsAt <= now) return 'expired'
  if (b.startsAt && b.startsAt > now) return 'scheduled'
  return 'live'
}

function toRow(b: Row, now: Date): BannerRow {
  return {
    id: b.id,
    title: cleanL10n(b.title),
    text: cleanL10n(b.text),
    buttonText: cleanL10n(b.buttonText),
    imageUrl: b.imageUrl,
    mobileImageUrl: b.mobileImageUrl ?? '',
    linkUrl: b.linkUrl ?? '',
    active: b.active,
    startsAt: b.startsAt?.toISOString() ?? null,
    endsAt: b.endsAt?.toISOString() ?? null,
    sortOrder: b.sortOrder,
    state: stateOf(b, now),
  }
}

export async function listBanners(now: Date = new Date()): Promise<BannerRow[]> {
  const rows = await prisma.banner.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
  return rows.map((b) => toRow(b, now))
}

export async function getBanner(id: number, now: Date = new Date()): Promise<BannerRow | null> {
  if (!Number.isInteger(id)) return null
  const b = await prisma.banner.findUnique({ where: { id } })
  return b ? toRow(b, now) : null
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
// Image URLs end up in src/srcset: whitespace would split a srcset into extra candidates.
const isBannerImage = (s: string) => !/\s/.test(s) && isProductImageUrl(s)

/** null = empty; undefined = not a valid date. */
function parseDate(v: unknown): Date | null | undefined {
  if (v === null || v === undefined || v === '') return null
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (s === '') return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? undefined : d
}

const label = (s: string) => (s ? s.slice(0, 60) : '(image only)')

export async function saveBanner(input: BannerInput, staff: Staff): Promise<BannerResult> {
  const errors: Record<string, string> = {}
  const title = cleanL10n(input.title)
  const text = cleanL10n(input.text)
  const buttonText = cleanL10n(input.buttonText)
  for (const [field, value] of [['title', title], ['text', text], ['buttonText', buttonText]] as const) {
    const max = BANNER_LIMITS[field]
    const long = locales.find((l) => (value[l]?.length ?? 0) > max)
    if (long) errors[field] = `At most ${max} characters (${long.toUpperCase()}).`
  }
  const imageUrl = str(input.imageUrl)
  if (!imageUrl) errors.imageUrl = 'Add an image (upload or paste an http(s) URL).'
  else if (!isBannerImage(imageUrl)) errors.imageUrl = 'Use an uploaded image or an http(s) URL.'
  const mobileImageUrl = str(input.mobileImageUrl)
  if (mobileImageUrl && !isBannerImage(mobileImageUrl)) errors.mobileImageUrl = 'Use an uploaded image or an http(s) URL.'
  const linkUrl = str(input.linkUrl)
  if (!isValidBannerLink(linkUrl)) errors.linkUrl = 'Use a site path like /c/chargers or a full http(s):// URL.'
  const startsAt = parseDate(input.startsAt)
  const endsAt = parseDate(input.endsAt)
  if (startsAt === undefined) errors.startsAt = 'Not a valid date.'
  if (endsAt === undefined) errors.endsAt = 'Not a valid date.'
  if (startsAt && endsAt && endsAt <= startsAt) errors.endsAt = 'End must be after start.'
  if (Object.keys(errors).length) return { ok: false, errors }

  const data = {
    title,
    text,
    buttonText,
    imageUrl,
    mobileImageUrl: mobileImageUrl || null,
    linkUrl: linkUrl || null,
    active: Boolean(input.active),
    startsAt: startsAt ?? null,
    endsAt: endsAt ?? null,
  }
  const name = label(title.en ?? title.uz ?? title.ru ?? '')

  if (input.id !== undefined) {
    if (!Number.isInteger(input.id) || !(await prisma.banner.findUnique({ where: { id: input.id }, select: { id: true } }))) {
      return { ok: false, errors: { form: 'Banner not found. It may have been deleted.' } }
    }
    await prisma.banner.update({ where: { id: input.id }, data })
    await logActivity(staff, 'update', 'banner', input.id, `Updated banner "${name}"`)
    return { ok: true, id: input.id }
  }
  const last = await prisma.banner.aggregate({ _max: { sortOrder: true } })
  const b = await prisma.banner.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? -1) + 1 } })
  await logActivity(staff, 'create', 'banner', b.id, `Created banner "${name}"`)
  return { ok: true, id: b.id }
}

export async function deleteBanner(id: number, staff: Staff): Promise<Simple> {
  const b = Number.isInteger(id) ? await prisma.banner.findUnique({ where: { id } }) : null
  if (!b) return { ok: false, error: 'Banner not found.' }
  await prisma.banner.delete({ where: { id } })
  const title = cleanL10n(b.title)
  await logActivity(staff, 'delete', 'banner', id, `Deleted banner "${label(title.en ?? title.uz ?? title.ru ?? '')}"`)
  return { ok: true }
}

export async function setBannerActive(id: number, active: boolean, staff: Staff): Promise<Simple> {
  if (!Number.isInteger(id) || !(await prisma.banner.findUnique({ where: { id }, select: { id: true } }))) return { ok: false, error: 'Banner not found.' }
  await prisma.banner.update({ where: { id }, data: { active: Boolean(active) } })
  await logActivity(staff, 'status', 'banner', id, `${active ? 'Switched on' : 'Switched off'} banner #${id}`)
  return { ok: true }
}

/** `ids` must list every banner exactly once, in the new order (a stale list from another tab is refused). */
export async function reorderBanners(ids: number[], staff: Staff): Promise<Simple> {
  if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id))) return { ok: false, error: 'The banner list changed. Reload the page and try again.' }
  const all = (await prisma.banner.findMany({ select: { id: true } })).map((b) => b.id)
  const given = new Set(ids)
  if ( ids.length !== all.length || given.size !== ids.length || all.some((id) => !given.has(id))) {
    return { ok: false, error: 'The banner list changed. Reload the page and try again.' }
  }
  await prisma.$transaction(ids.map((id, i) => prisma.banner.update({ where: { id }, data: { sortOrder: i } })))
  await logActivity(staff, 'update', 'banner', null, `Reordered banners: ${ids.join(', ')}`)
  return { ok: true }
}
