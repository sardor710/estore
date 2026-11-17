import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/admin/session'
import { loadPromotionInput, targetOptions } from '@/lib/admin/promotions'
import { PageHeader } from '@/components/admin/ui'
import BackLink from '@/components/admin/BackLink'
import PromotionEditor from '@/components/admin/PromotionEditor'

export const metadata = { title: 'Edit promotion' }

export default async function EditPromotionPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('promotions')
  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()
  const [promotion, options] = await Promise.all([loadPromotionInput(id), targetOptions()])
  if (!promotion) notFound()
  return (
    <>
      <BackLink href="/admin/promotions">Promotions</BackLink>
      <PageHeader title={promotion.name} />
      <PromotionEditor key={promotion.id} initial={promotion} options={options} />
    </>
  )
}
