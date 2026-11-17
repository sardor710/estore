import { adminApi } from '@/lib/admin/api'
import { parseListParams, productsCsv } from '@/lib/admin/product-list'
import { tashkentDay } from '@/lib/analytics/visitor'

export const dynamic = 'force-dynamic'

/** CSV of the products matching the list filters (same params as /admin/products) - every page, one line per variant. */
export const GET = adminApi('catalog', async (req) => {
  const params = parseListParams(Object.fromEntries(req.nextUrl.searchParams))
  const csv = await productsCsv(params)
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="products-${tashkentDay(new Date())}.csv"`,
      'cache-control': 'no-store',
    },
  })
})
