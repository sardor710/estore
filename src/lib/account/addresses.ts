import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { getRegion } from '@/lib/regions'
import { cleanLatLng } from '@/lib/geo'

// Saved delivery addresses of a signed-in customer. Every query is scoped by the session's customer id:
// an address id from the request is only ever looked up together with that customer id.

type Db = Prisma.TransactionClient

export const MAX_ADDRESSES = 10

export type AddressInput = {
  /** Present = edit that address (must belong to the customer). */
  id?: number
  label: string
  recipient: string
  /** Region code from REGIONS (`getRegion`). */
  region: string
  address: string
  isDefault?: boolean
  /** Optional delivery pin: both or neither (null/absent = no pin). */
  lat?: number | null
  lng?: number | null
}

export type AddressView = {
  id: number
  label: string
  recipient: string
  region: string
  address: string
  lat: number | null
  lng: number | null
  isDefault: boolean
  createdAt: Date
}

export type SaveAddressResult = { ok: true; id: number } | { ok: false; error: 'INVALID' | 'LIMIT' | 'NOT_FOUND' }

type Clean = { label: string; recipient: string; region: string; address: string; lat: number | null; lng: number | null }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Trimmed, validated fields or null: label <= 40 (may be empty), recipient 2-100, address 3-300, known region, optional valid pin. */
export function cleanAddress(i: unknown): Clean | null {
  const o = (i ?? {}) as Record<string, unknown>
  const label = str(o.label)
  const recipient = str(o.recipient)
  const address = str(o.address)
  const region = typeof o.region === 'string' ? getRegion(o.region) : undefined
  if (label.length > 40 || recipient.length < 2 || recipient.length > 100 || address.length < 3 || address.length > 300 || !region) return null
  const pin = cleanLatLng(o.lat, o.lng)
  if (pin === 'INVALID') return null
  return { label, recipient, region: region.code, address, lat: pin?.lat ?? null, lng: pin?.lng ?? null }
}

const select = { id: true, label: true, recipient: true, region: true, address: true, lat: true, lng: true, isDefault: true, createdAt: true } as const
const newestFirst = [{ createdAt: 'desc' as const }, { id: 'desc' as const }]

export async function listAddresses(cid: number): Promise<AddressView[]> {
  return prisma.customerAddress.findMany({
    where: { customerId: cid },
    select,
    orderBy: [{ isDefault: 'desc' }, ...newestFirst],
  })
}

/** Keeps exactly one default when any address exists: the newest one, skipping `avoid` when another exists. */
async function ensureOneDefault(db: Db, cid: number, avoid?: number): Promise<void> {
  const defaults = await db.customerAddress.findMany({ where: { customerId: cid, isDefault: true }, select: { id: true }, orderBy: newestFirst })
  if (defaults.length === 1) return
  if (defaults.length > 1) {
    await db.customerAddress.updateMany({ where: { customerId: cid, isDefault: true, id: { not: defaults[0].id } }, data: { isDefault: false } })
    return
  }
  const pick =
    (await db.customerAddress.findFirst({ where: { customerId: cid, ...(avoid ? { id: { not: avoid } } : {}) }, select: { id: true }, orderBy: newestFirst })) ??
    (await db.customerAddress.findFirst({ where: { customerId: cid }, select: { id: true }, orderBy: newestFirst }))
  if (pick) await db.customerAddress.update({ where: { id: pick.id }, data: { isDefault: true } })
}

/**
 * Inserts a validated address inside `db` (a transaction). First address becomes the default.
 * 'LIMIT' at MAX_ADDRESSES; with `skipDuplicate`, an identical recipient/region/address is not stored twice.
 */
export async function insertAddress(
  db: Db,
  cid: number,
  data: Clean,
  opts: { isDefault?: boolean; skipDuplicate?: boolean } = {},
): Promise<{ id: number } | 'LIMIT' | 'DUPLICATE'> {
  if (opts.skipDuplicate) {
    const same = await db.customerAddress.findFirst({
      where: { customerId: cid, recipient: data.recipient, region: data.region, address: data.address },
      select: { id: true, lat: true },
    })
    if (same) {
      // Same address again with a pin: keep the address, just attach the pin it was missing.
      if (same.lat === null && data.lat !== null) await db.customerAddress.update({ where: { id: same.id }, data: { lat: data.lat, lng: data.lng } })
      return 'DUPLICATE'
    }
  }
  const count = await db.customerAddress.count({ where: { customerId: cid } })
  if (count >= MAX_ADDRESSES) return 'LIMIT'
  const isDefault = count === 0 || opts.isDefault === true
  if (isDefault) await db.customerAddress.updateMany({ where: { customerId: cid, isDefault: true }, data: { isDefault: false } })
  const row = await db.customerAddress.create({ data: { customerId: cid, ...data, isDefault }, select: { id: true } })
  return row
}

export async function saveAddress(cid: number, input: AddressInput): Promise<SaveAddressResult> {
  const data = cleanAddress(input)
  if (!data) return { ok: false, error: 'INVALID' }
  const wantDefault = input?.isDefault === true
  const id = input?.id
  if (id !== undefined && id !== null && (!Number.isSafeInteger(id) || id <= 0)) return { ok: false, error: 'NOT_FOUND' }

  return prisma.$transaction(async (tx): Promise<SaveAddressResult> => {
    if (id == null) {
      const r = await insertAddress(tx, cid, data, { isDefault: wantDefault })
      if (r === 'LIMIT' || r === 'DUPLICATE') return { ok: false, error: 'LIMIT' }
      return { ok: true, id: r.id }
    }
    const own = await tx.customerAddress.findFirst({ where: { id, customerId: cid }, select: { id: true } })
    if (!own) return { ok: false, error: 'NOT_FOUND' }
    if (wantDefault) await tx.customerAddress.updateMany({ where: { customerId: cid, isDefault: true, id: { not: id } }, data: { isDefault: false } })
    await tx.customerAddress.update({ where: { id }, data: { ...data, isDefault: wantDefault } })
    await ensureOneDefault(tx, cid, wantDefault ? undefined : id)
    return { ok: true, id }
  })
}

/** Deletes the customer's own address (false when it is not theirs / missing); the default moves to the newest remaining. */
export async function deleteAddress(cid: number, id: number): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id <= 0) return false
  return prisma.$transaction(async (tx) => {
    const r = await tx.customerAddress.deleteMany({ where: { id, customerId: cid } })
    if (r.count !== 1) return false
    await ensureOneDefault(tx, cid)
    return true
  })
}

/** Attaches a delivery pin to the customer's own address (bot location message). False when not theirs / bad pin. */
export async function setAddressPin(cid: number, id: number, lat: unknown, lng: unknown): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id <= 0) return false
  const pin = cleanLatLng(lat, lng)
  if (!pin || pin === 'INVALID') return false
  const r = await prisma.customerAddress.updateMany({ where: { id, customerId: cid }, data: { lat: pin.lat, lng: pin.lng } })
  return r.count === 1
}
