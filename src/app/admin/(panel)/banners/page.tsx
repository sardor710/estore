import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requirePermission } from '@/lib/admin/session'
import { listBanners } from '@/lib/admin/banners'
import { btn, PageHeader } from '@/components/admin/ui'
import BannerList from '@/components/admin/BannerList'

export const metadata = { title: 'Banners' }

export default async function BannersPage() {
  await requirePermission('banners')
  const banners = await listBanners()
  return (
    <>
      <PageHeader
        title="Homepage banners"
        description="Slides at the top of the homepage, shown in this order. Each needs an image; title, text and button are optional and translated per language."
        actions={
          <Link href="/admin/banners/new" className={btn}>
            <Plus size={16} aria-hidden /> Add banner
          </Link>
        }
      />
      <BannerList banners={banners} />
    </>
  )
}
