import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/db'
import { listActivity, logActivity, ACTIVITY_PAGE_SIZE } from '@/lib/admin/activity'
import type { Staff } from '@/lib/admin/session'

const ann: Staff = { id: 1, email: 'ann@shop.uz', name: 'Ann', role: 'ADMIN' }
const bob: Staff = { id: 2, email: 'bob@shop.uz', name: 'Bob', role: 'PRODUCT_MANAGER' }

describe('logActivity', () => {
  it('stores actor, action, entity, id and summary', async () => {
    await logActivity(ann, 'update', 'product', 12, 'Updated product SKU-1')
    await logActivity(ann, 'update', 'settings', null, 'Saved settings')
    const rows = await prisma.activityLog.findMany({ orderBy: { id: 'asc' } })
    expect(rows[0]).toMatchObject({ userId: 1, userEmail: 'ann@shop.uz', action: 'update', entity: 'product', entityId: '12', summary: 'Updated product SKU-1' })
    expect(rows[1].entityId).toBeNull()
  })
  it('truncates very long summaries', async () => {
    await logActivity(ann, 'update', 'product', 1, 'x'.repeat(5000))
    expect((await prisma.activityLog.findFirstOrThrow()).summary.length).toBeLessThanOrEqual(500)
  })
})

describe('listActivity', () => {
  it('newest first, filtered by user, entity and Tashkent date range, 50 per page', async () => {
    const at = (iso: string) => new Date(iso)
    await prisma.activityLog.createMany({
      data: [
        { userId: 1, userEmail: ann.email, action: 'update', entity: 'product', entityId: '1', summary: 'a', createdAt: at('2026-11-01T10:00:00Z') },
        { userId: 2, userEmail: bob.email, action: 'status', entity: 'order', entityId: '7', summary: 'b', createdAt: at('2026-11-02T10:00:00Z') },
        // 20:30 UTC on 2 Nov is already 3 Nov in Tashkent.
        { userId: 1, userEmail: ann.email, action: 'create', entity: 'user', entityId: '3', summary: 'c', createdAt: at('2026-11-02T20:30:00Z') },
      ],
    })
    const all = await listActivity({ page: 1 })
    expect(all.total).toBe(3)
    expect(all.rows.map((r) => r.summary)).toEqual(['c', 'b', 'a'])
    expect((await listActivity({ userId: 1, page: 1 })).rows.map((r) => r.summary)).toEqual(['c', 'a'])
    expect((await listActivity({ entity: 'order', page: 1 })).rows.map((r) => r.summary)).toEqual(['b'])
    expect((await listActivity({ from: '2026-11-02', to: '2026-11-02', page: 1 })).rows.map((r) => r.summary)).toEqual(['b'])
    expect((await listActivity({ from: '2026-11-03', page: 1 })).rows.map((r) => r.summary)).toEqual(['c'])
    expect((await listActivity({ from: 'garbage', page: 1 })).total).toBe(3)
  })
  it('paginates', async () => {
    expect(ACTIVITY_PAGE_SIZE).toBe(50)
    await prisma.activityLog.createMany({
      data: Array.from({ length: 55 }, (_, i) => ({ userId: 1, userEmail: ann.email, action: 'update', entity: 'product', summary: `s${i}`, createdAt: new Date(1_800_000_000_000 + i * 1000) })),
    })
    const p1 = await listActivity({ page: 1 })
    const p2 = await listActivity({ page: 2 })
    expect(p1.total).toBe(55)
    expect(p1.rows).toHaveLength(50)
    expect(p2.rows).toHaveLength(5)
    expect(p2.rows.at(-1)!.summary).toBe('s0')
    expect((await listActivity({ page: 0 })).rows).toHaveLength(50)
  })
})
