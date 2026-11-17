import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/admin/session'
import { PRODUCTS_PAGE_SIZE, PRODUCT_SORTS, listParamsToQuery, parseListParams, queryProducts, type ProductListParams, type ProductSort } from '@/lib/admin/product-list'
import { brandOptions } from '@/lib/admin/brands'
import { listPromotions } from '@/lib/admin/promotions'
import { getSettings } from '@/lib/settings'
import { tashkentDay } from '@/lib/analytics/visitor'
import type { L10n } from '@/lib/localized'
import { PageTitle, btn, btnGhost, card, input } from '@/components/admin/ui'
import ProductTable from '@/components/admin/ProductTable'

export const metadata = { title: 'Products' }

const fieldLabel = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500'
const defaultDir = (s: ProductSort) => (s === 'title' ? 'asc' : 'desc')

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission('catalog')
  const params = parseListParams(await searchParams)
  const [{ rows, total }, cats, brands, promos, settings] = await Promise.all([
    queryProducts(params),
    prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    brandOptions(),
    listPromotions(),
    getSettings(),
  ])
  const categories = cats.map((c) => {
    const n = (c.name ?? {}) as L10n
    return { id: c.id, label: n.en || n.uz || n.ru || c.slug }
  })
  // Bulk "add to promotion" only offers promotions that list products (category/brand promos have no product list).
  const productPromos = promos.filter((p) => p.targetType === 'PRODUCT' && p.state !== 'expired').map((p) => ({ id: p.id, label: `${p.name} (${p.state})` }))

  const sort = params.sort ?? 'updated'
  const dir = params.dir ?? defaultDir(sort)
  const pages = Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE))
  const page = Math.min(params.page ?? 1, pages)
  const href = (over: Partial<ProductListParams>) => {
    const qs = listParamsToQuery({ ...params, ...over })
    return `/admin/products${qs ? `?${qs}` : ''}`
  }
  const sortHrefs = Object.fromEntries(
    PRODUCT_SORTS.map((s) => {
      const nextDir = s === sort ? (dir === 'asc' ? 'desc' : 'asc') : defaultDir(s)
      return [s, href({ sort: s === 'updated' ? undefined : s, dir: nextDir === defaultDir(s) ? undefined : nextDir, page: undefined })]
    }),
  ) as Record<ProductSort, string>
  const exportQs = listParamsToQuery({ ...params, page: undefined })
  const { page: _page, sort: _sort, dir: _dir, ...filters } = params
  const filtered = Object.keys(filters).length > 0

  return (
    <>
      <PageTitle
        actions={
          <div className="flex flex-wrap gap-2">
            <a href={`/api/admin/products/export${exportQs ? `?${exportQs}` : ''}`} className={btnGhost}>
              Export CSV
            </a>
            <Link href="/admin/import" className={btn}>
              Import from Anker
            </Link>
          </div>
        }
      >
        Products
      </PageTitle>

      {/* Plain GET form: the filters live in the URL (shareable, back button works). */}
      <form method="get" className={`${card} mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4`} aria-label="Filter products">
        <label className="sm:col-span-2">
          <span className={fieldLabel}>Search</span>
          <input className={input} name="q" defaultValue={params.q ?? ''} placeholder="Title (any language) or SKU" />
        </label>
        <label>
          <span className={fieldLabel}>Category</span>
          <select className={input} name="categoryId" defaultValue={params.categoryId ?? ''}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={fieldLabel}>Brand</span>
          <select className={input} name="brandId" defaultValue={params.brandId ?? ''}>
            <option value="">All</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={fieldLabel}>Status</span>
          <select className={input} name="status" defaultValue={params.status ?? ''}>
            <option value="">All</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
          </select>
        </label>
        <label>
          <span className={fieldLabel}>Stock</span>
          <select className={input} name="stock" defaultValue={params.stock ?? ''}>
            <option value="">All</option>
            <option value="in">In stock</option>
            <option value="low">Low (≤ {settings.lowStockThreshold})</option>
            <option value="out">Out of stock</option>
          </select>
        </label>
        <div>
          <span className={fieldLabel}>Price (UZS)</span>
          <div className="flex gap-2">
            <input className={input} name="priceMin" inputMode="numeric" defaultValue={params.priceMin ?? ''} placeholder="min" aria-label="Minimum price" />
            <input className={input} name="priceMax" inputMode="numeric" defaultValue={params.priceMax ?? ''} placeholder="max" aria-label="Maximum price" />
          </div>
        </div>
        <label>
          <span className={fieldLabel}>Promotion</span>
          <select className={input} name="promo" defaultValue={params.promo === undefined ? '' : params.promo ? '1' : '0'}>
            <option value="">Any</option>
            <option value="1">Has active promo</option>
            <option value="0">No promo</option>
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="incomplete" value="1" defaultChecked={params.incomplete === true} /> Incomplete only
          </label>
          {params.sort ? <input type="hidden" name="sort" value={params.sort} /> : null}
          {params.dir ? <input type="hidden" name="dir" value={params.dir} /> : null}
          <span className="mr-auto" />
          {filtered ? (
            <Link href="/admin/products" className={btnGhost}>
              Reset
            </Link>
          ) : null}
          <button type="submit" className={btn}>
            Apply
          </button>
        </div>
      </form>

      <p className="mb-2 text-sm text-neutral-600" aria-live="polite">
        {total} product{total === 1 ? '' : 's'}
        {filtered ? (total === 1 ? ' matches these filters' : ' match these filters') : ''}. Click a price or stock value to edit it (Enter saves).
      </p>

      {rows.length === 0 ? (
        <div className={`${card} text-sm text-neutral-500`}>{filtered ? 'No products match these filters.' : 'No products yet. Import one from Anker.'}</div>
      ) : (
        <ProductTable
          rows={rows.map(({ updatedAt, createdAt: _c, ...r }) => ({ ...r, updated: tashkentDay(updatedAt) }))}
          sort={sort}
          dir={dir}
          sortHrefs={sortHrefs}
          lowStockThreshold={settings.lowStockThreshold}
          categories={categories}
          brands={brands}
          promotions={productPromos}
        />
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className={btnGhost}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-600">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={href({ page: page + 1 })} className={btnGhost}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  )
}
