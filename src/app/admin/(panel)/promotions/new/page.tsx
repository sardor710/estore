import Link from 'next/link'
import { requirePermission } from '@/lib/admin/session'
import { targetOptions } from '@/lib/admin/promotions'
import { PageTitle } from '@/components/admin/ui'
import PromotionEditor from '@/components/admin/PromotionEditor'

export const metadata = { title: 'New promotion' }

export default async function NewPromotionPage() {
  await requirePermission('promotions')
  const options = await targetOptions()
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/promotions" className="text-neutral-500 underline">
          Promotions
        </Link>
      </p>
      <PageTitle>New promotion</PageTitle>
      <PromotionEditor initial={null} options={options} />
    </>
  )
}
