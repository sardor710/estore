import BackLink from '@/components/admin/BackLink'
import { requirePermission } from '@/lib/admin/session'
import { PageHeader } from '@/components/admin/ui'
import BannerEditor from '@/components/admin/BannerEditor'

export const metadata = { title: 'New banner' }

export default async function NewBannerPage() {
  await requirePermission('banners')
  return (
    <>
      <BackLink href="/admin/banners">Banners</BackLink>
      <PageHeader title="New banner" />
      <BannerEditor initial={null} />
    </>
  )
}
