import { requirePermission } from '@/lib/admin/session'
import { targetOptions } from '@/lib/admin/promotions'
import { PageHeader } from '@/components/admin/ui'
import BackLink from '@/components/admin/BackLink'
import PromotionEditor from '@/components/admin/PromotionEditor'

export const metadata = { title: 'New promotion' }

export default async function NewPromotionPage() {
  await requirePermission('promotions')
  const options = await targetOptions()
  return (
    <>
      <BackLink href="/admin/promotions">Promotions</BackLink>
      <PageHeader title="New promotion" />
      <PromotionEditor initial={null} options={options} />
    </>
  )
}
