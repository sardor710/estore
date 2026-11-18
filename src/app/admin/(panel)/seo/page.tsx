import Link from 'next/link'
import { SearchCheck } from 'lucide-react'
import { requirePermission } from '@/lib/admin/session'
import { seoAudit } from '@/lib/admin/seo'
import { locales } from '@/i18n/routing'
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from '@/lib/admin/products-shared'
import { Badge, EmptyState, PageHeader, card } from '@/components/admin/ui'
import SeoTools, { SeoRowButton } from '@/components/admin/SeoTools'

export const metadata = { title: 'SEO' }
export const dynamic = 'force-dynamic'

export default async function SeoPage() {
  await requirePermission('catalog')
  const rows = await seoAudit()
  const withIssues = rows.filter((r) => r.issues.length).length

  return (
    <>
      <PageHeader
        title="SEO"
        description={`Search-engine titles (max ${SEO_TITLE_MAX}) and descriptions (max ${SEO_DESCRIPTION_MAX}) of every product, in uz, ru and en. Auto SEO writes them from the product's name, brand and short description. Blank ones are also filled automatically when a product is published.`}
      />
      <div className={`${card} mb-4`}>
        <SeoTools total={rows.length} withIssues={withIssues} />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={SearchCheck} title="No products yet." />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className={card}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Link href={`/admin/products/${r.id}`} className="font-semibold text-neutral-900 hover:underline">
                  {r.name || r.slug}
                </Link>
                <Badge tone={r.status === 'PUBLISHED' ? 'green' : 'amber'}>{r.status}</Badge>
                {r.issues.length ? <Badge tone="red">{r.issues.length} issue(s)</Badge> : <Badge tone="green">All good</Badge>}
                <span className="ml-auto">
                  <SeoRowButton id={r.id} hasIssues={r.issues.length > 0} />
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {locales.map((l) => {
                  const issues = r.issues.filter((i) => i.locale === l)
                  return (
                    <div key={l} className="min-w-0 rounded-lg border border-neutral-200 bg-neutral-50/60 p-3 text-sm">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase text-neutral-500">{l}</span>
                        {issues.map((i) => (
                          <Badge key={i.field + i.problem} tone={i.problem === 'too short' ? 'amber' : 'red'}>
                            {i.field} {i.problem}
                          </Badge>
                        ))}
                      </div>
                      <p className="break-words font-medium text-blue-800">{r.seoTitle[l] || <span className="italic text-neutral-400">no title</span>}</p>
                      <p className="mt-0.5 break-words text-xs text-neutral-600">{r.seoDescription[l] || <span className="italic text-neutral-400">no description</span>}</p>
                    </div>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
