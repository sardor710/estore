import { adminApi } from '@/lib/admin/api'
import { customersCsv, isCustomerSort, isSegment } from '@/lib/customers'
import { tashkentDay } from '@/lib/analytics/visitor'

export const dynamic = 'force-dynamic'

/** CSV of the clients matching the list filters (q, segment, sort) - every page, not just the one on screen. */
export const GET = adminApi('clients', async (req) => {
  const p = req.nextUrl.searchParams
  const segment = p.get('segment')
  const sort = p.get('sort')
  const csv = await customersCsv({
    q: p.get('q') ?? undefined,
    segment: isSegment(segment) ? segment : undefined,
    sort: isCustomerSort(sort) ? sort : undefined,
  })
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="clients-${tashkentDay(new Date())}.csv"`,
      'cache-control': 'no-store',
    },
  })
})
