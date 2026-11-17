import Link from 'next/link'
import { listProducts } from '@/lib/admin/product-view'
import { formatUzs } from '@/lib/money'
import { Badge, PageTitle, btn, card } from '@/components/admin/ui'
import { requirePermission } from '@/lib/admin/session'

export const metadata = { title: 'Products' }

export default async function ProductsPage() {
  await requirePermission('catalog')
  const products = await listProducts()
  return (
    <>
      <PageTitle
        actions={
          <Link href="/admin/import" className={btn}>
            Import from Anker
          </Link>
        }
      >
        Products
      </PageTitle>
      {products.length === 0 ? (
        <div className={`${card} text-sm text-neutral-500`}>No products yet. Import one from Anker.</div>
      ) : (
        <ul className="space-y-2">
          {products.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/products/${p.id}`} className={`${card} flex items-center gap-3 transition hover:border-neutral-400`}>
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-neutral-100 object-cover" />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded-lg bg-neutral-100" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-neutral-900">{p.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone={p.status === 'PUBLISHED' ? 'green' : 'amber'}>{p.status}</Badge>
                    {p.isDemo ? <Badge tone="blue">Demo</Badge> : null}
                    {p.missing.map((l) => (
                      <Badge key={l} tone="red">
                        no {l.toUpperCase()} title
                      </Badge>
                    ))}
                    {(['uz', 'ru'] as const).map((l) => (p.reviewed[l] ? <Badge key={l} tone="green">{l.toUpperCase()} reviewed</Badge> : null))}
                    <span className="text-xs text-neutral-500">{p.category}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <div className="font-semibold">{p.variantCount ? formatUzs(p.minPrice, 'en') : 'no variants'}</div>
                  <div className="text-xs text-neutral-500">{p.variantCount} variant{p.variantCount === 1 ? '' : 's'}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
