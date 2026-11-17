import { prisma } from '@/lib/db'
import { slugify } from '@/lib/importer/anker-parse'
import { logActivity } from './activity'
import { isHttpUrl, SLUG_RE } from './products-shared'
import type { Staff } from './session'

export type BrandRow = { id: number; name: string; slug: string; logoUrl: string | null; sortOrder: number; productCount: number }
export type BrandInput = { id?: number; name: string; slug: string; logoUrl: string; sortOrder: number }
export type BrandResult = { ok: true; id: number } | { ok: false; error: string }

const isUniqueViolation = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'

export async function listBrands(): Promise<BrandRow[]> {
  const rows = await prisma.brand.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  return rows.map((b) => ({ id: b.id, name: b.name, slug: b.slug, logoUrl: b.logoUrl, sortOrder: b.sortOrder, productCount: b._count.products }))
}

/** Brand id with this name, compared trimmed and case-insensitively (SQLite lower() is ASCII-only). */
async function findIdByName(name: string, exceptId?: number): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Brand" WHERE lower("name") = lower(${name.trim()})`
  const hit = rows.map((r) => Number(r.id)).find((id) => id !== exceptId)
  return hit ?? null
}

async function freeSlug(base: string): Promise<string> {
  const root = base || 'brand'
  let slug = root
  for (let n = 2; await prisma.brand.findUnique({ where: { slug }, select: { id: true } }); n++) slug = `${root}-${n}`
  return slug
}

/** Id of the brand with this name (case-insensitive, trimmed); created with a free slug when missing. */
export async function upsertBrandByName(name: string): Promise<number> {
  const clean = name.trim()
  if (!clean) throw new Error('Brand name is empty')
  for (let attempt = 0; attempt < 3; attempt++) {
    const found = await findIdByName(clean)
    if (found !== null) return found
    try {
      const b = await prisma.brand.create({ data: { name: clean, slug: await freeSlug(slugify(clean)) } })
      return b.id
    } catch (e) {
      if (!isUniqueViolation(e)) throw e // a concurrent import created it (or took the slug): look again
    }
  }
  throw new Error(`Could not create brand "${clean}"`)
}

export async function saveBrand(input: BrandInput, actor: Staff): Promise<BrandResult> {
  const id = input?.id
  if (id !== undefined && !Number.isInteger(id)) return { ok: false, error: 'Brand not found.' }
  const name = typeof input?.name === 'string' ? input.name.trim() : ''
  if (!name || name.length > 100) return { ok: false, error: 'Name is required (up to 100 characters).' }
  const rawSlug = typeof input?.slug === 'string' ? input.slug.trim() : ''
  const slug = rawSlug || slugify(name)
  if (!SLUG_RE.test(slug)) return { ok: false, error: 'Slug may contain only a-z, 0-9 and single dashes.' }
  const logoUrl = typeof input?.logoUrl === 'string' ? input.logoUrl.trim() : ''
  // /uploads/ paths: word characters, dots, dashes and slashes only, never a ".." segment.
  if (logoUrl && !isHttpUrl(logoUrl) && !(/^\/uploads\/[\w./-]+$/.test(logoUrl) && !logoUrl.includes('..'))) {
    return { ok: false, error: 'Logo must be an http(s) URL or an /uploads/... path.' }
  }
  const sortOrder = Number.isInteger(input?.sortOrder) ? input.sortOrder : 0

  if ((await findIdByName(name, id)) !== null) return { ok: false, error: 'A brand with this name already exists.' }
  const slugOwner = await prisma.brand.findUnique({ where: { slug }, select: { id: true } })
  if (slugOwner && slugOwner.id !== id) return { ok: false, error: 'This slug is already used by another brand.' }

  const data = { name, slug, logoUrl: logoUrl || null, sortOrder }
  try {
    if (id === undefined) {
      const b = await prisma.brand.create({ data })
      await logActivity(actor, 'create', 'brand', b.id, `Created brand "${name}"`)
      return { ok: true, id: b.id }
    }
    const r = await prisma.brand.updateMany({ where: { id }, data })
    if (r.count !== 1) return { ok: false, error: 'Brand not found.' }
    await logActivity(actor, 'update', 'brand', id, `Updated brand "${name}"`)
    return { ok: true, id }
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: 'A brand with this name or slug already exists.' }
    throw e
  }
}

/** Refused while any product still references the brand (reassign those products first). */
export async function deleteBrand(id: number, actor: Staff): Promise<{ ok: true } | { ok: false; error: string }> {
  const b = await prisma.brand.findUnique({ where: { id }, include: { _count: { select: { products: true } } } })
  if (!b) return { ok: false, error: 'Brand not found.' }
  if (b._count.products > 0) return { ok: false, error: `"${b.name}" is used by ${b._count.products} product(s). Change their brand first.` }
  const r = await prisma.brand.deleteMany({ where: { id, products: { none: {} } } })
  if (r.count !== 1) return { ok: false, error: 'The brand is in use or was already deleted.' }
  await logActivity(actor, 'delete', 'brand', id, `Deleted brand "${b.name}"`)
  return { ok: true }
}

/** Options for the product editor's brand select. */
export async function brandOptions(): Promise<{ id: number; label: string }[]> {
  const rows = await prisma.brand.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } })
  return rows.map((b) => ({ id: b.id, label: b.name }))
}
