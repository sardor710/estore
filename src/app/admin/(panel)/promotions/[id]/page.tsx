import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/admin/session'
import { loadPromotionInput, targetOptions } from '@/lib/admin/promotions'
import { PageTitle } from '@/components/admin/ui'
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
      <p className="mb-2 text-sm">
        <Link href="/admin/promotions" className="text-neutral-500 underline">
          Promotions
        </Link>
      </p>
      <PageTitle>{promotion.name}</PageTitle>
      <PromotionEditor key={promotion.id} initial={promotion} options={options} />
    </>
  )
}
