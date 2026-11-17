import { prisma } from '@/lib/db'
import { PageTitle } from '@/components/admin/ui'
import CategoriesEditor, { type CategoryRow } from '@/components/admin/CategoriesEditor'
import type { L10n } from '@/lib/localized'
import { requirePermission } from '@/lib/admin/session'

export const metadata = { title: 'Categories' }

export default async function CategoriesPage() {
  await requirePermission('catalog')
  const cats = await prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
  const rows: CategoryRow[] = cats.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: (c.name && typeof c.name === 'object' && !Array.isArray(c.name) ? c.name : {}) as L10n,
    parentId: c.parentId,
    sortOrder: c.sortOrder,
    template: c.template === 'SIMPLE' ? 'SIMPLE' : 'DETAILED',
  }))
  return (
    <>
      <PageTitle>Categories</PageTitle>
      <CategoriesEditor rows={rows} />
    </>
  )
}
