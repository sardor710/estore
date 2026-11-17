import { requirePermission } from '@/lib/admin/session'
import { listBrands } from '@/lib/admin/brands'
import { PageHeader } from '@/components/admin/ui'
import BrandsEditor from '@/components/admin/BrandsEditor'

export const metadata = { title: 'Brands' }

export default async function BrandsPage() {
  await requirePermission('catalog')
  const brands = await listBrands()
  return (
    <>
      <PageHeader title="Brands" />
      <BrandsEditor brands={brands} />
    </>
  )
}
