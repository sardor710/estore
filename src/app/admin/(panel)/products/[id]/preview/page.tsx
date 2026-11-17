import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { requirePermission } from '@/lib/admin/session'
import { getProductForPreview } from '@/lib/admin/product-preview'
import { loadMessages } from '@/i18n/request'
import { locales } from '@/i18n/routing'
import DetailedProduct from '@/components/store/DetailedProduct'
import SimpleProduct from '@/components/store/SimpleProduct'
import { Badge } from '@/components/admin/ui'

export const metadata: Metadata = {
  title: 'Product preview',
  robots: { index: false, follow: false, nocache: true },
}

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ locale?: string | string[] }> }

/** Staff-only storefront preview (drafts included), rendered with the storefront product templates and live promo pricing. */
export default async function ProductPreviewPage({ params, searchParams }: Props) {
  await requirePermission('catalog')
  const id = Number((await params).id)
  const raw = (await searchParams).locale
  const found = await getProductForPreview(id, typeof raw === 'string' ? raw : '')
  if (!found) notFound()
  const { product, locale } = found
  const messages = await loadMessages(locale)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Preview</strong>
        <Badge tone={product.status === 'PUBLISHED' ? 'green' : 'amber'}>{product.status}</Badge>
        <span className="mr-auto">{product.status === 'PUBLISHED' ? 'This is how the live page looks.' : 'Draft: customers cannot see this page.'} Unsaved editor changes are not shown.</span>
        <nav aria-label="Preview language" className="flex gap-1">
          {locales.map((l) => (
            <Link
              key={l}
              href={`/admin/products/${product.id}/preview?locale=${l}`}
              aria-current={l === locale ? 'page' : undefined}
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${l === locale ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-100'}`}
            >
              {l}
            </Link>
          ))}
        </nav>
        <Link href={`/admin/products/${product.id}`} className="underline">
          Back to editor
        </Link>
      </div>
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white" lang={locale}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {product.template === 'DETAILED' ? (
            <DetailedProduct product={product} related={[]} locale={locale} />
          ) : (
            <SimpleProduct product={product} related={[]} locale={locale} />
          )}
        </NextIntlClientProvider>
      </div>
    </>
  )
}
