import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { loadEditorProduct } from '@/lib/admin/product-view'
import { PageTitle } from '@/components/admin/ui'
import ProductEditor from '@/components/admin/ProductEditor'
import type { L10n } from '@/lib/localized'
import { requirePermission } from '@/lib/admin/session'

export const metadata = { title: 'Edit product' }

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ notice?: string }>
}) {
  await requirePermission('catalog')
  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()
  const [product, cats, sp] = await Promise.all([loadEditorProduct(id), prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }), searchParams])
  if (!product) notFound()
  const categories = cats.map((c) => {
    const n = (c.name ?? {}) as L10n
    return { id: c.id, label: n.en || n.uz || n.ru || c.slug }
  })
  const title = product.input.title.en || product.input.title.uz || product.input.slug

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/products" className="text-neutral-500 underline">
          Products
        </Link>
      </p>
      <PageTitle>{title}</PageTitle>
      <ProductEditor product={product} categories={categories} initialNotice={sp.notice} />
    </>
  )
}
