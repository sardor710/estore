import BackLink from '@/components/admin/BackLink'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/admin/session'
import { getBanner } from '@/lib/admin/banners'
import { Badge, PageHeader } from '@/components/admin/ui'
import BannerEditor from '@/components/admin/BannerEditor'

export const metadata = { title: 'Edit banner' }

const STATE = { live: ['Live', 'green'], scheduled: ['Scheduled', 'blue'], expired: ['Expired', 'amber'], off: ['Off', 'neutral'] } as const

export default async function EditBannerPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('banners')
  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()
  const banner = await getBanner(id)
  if (!banner) notFound()
  const { sortOrder: _order, state, ...input } = banner
  const [label, tone] = STATE[state]
  return (
    <>
      <BackLink href="/admin/banners">Banners</BackLink>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {banner.title.en || banner.title.uz || banner.title.ru || 'Image-only banner'} <Badge tone={tone}>{label}</Badge>
          </span>
        }
      />
      <BannerEditor key={banner.id} initial={input} />
    </>
  )
}
