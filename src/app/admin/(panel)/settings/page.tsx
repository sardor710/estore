import { getSettingsView } from '@/lib/admin/settings'
import { isTranslationConfigured } from '@/lib/translate'
import { requirePermission } from '@/lib/admin/session'
import { can } from '@/lib/permissions'
import { PageHeader } from '@/components/admin/ui'
import SettingsForm from '@/components/admin/SettingsForm'

export const metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const staff = await requirePermission('settings.business')
  // Only the masked token ever reaches the client, and only for staff allowed to manage integrations.
  const view = await getSettingsView({ integrations: can(staff.role, 'settings.integrations') })
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsForm view={view} translationConfigured={view.integrations ? isTranslationConfigured() : null} />
    </>
  )
}
