import { getSettingsView } from '@/lib/admin/settings'
import { isTranslationConfigured } from '@/lib/translate'
import { PageTitle } from '@/components/admin/ui'
import SettingsForm from '@/components/admin/SettingsForm'

export const metadata = { title: 'Settings' }

export default async function SettingsPage() {
  // Only the masked token ever reaches the client.
  const view = await getSettingsView()
  return (
    <>
      <PageTitle>Settings</PageTitle>
      <SettingsForm view={view} translationConfigured={isTranslationConfigured()} />
    </>
  )
}
