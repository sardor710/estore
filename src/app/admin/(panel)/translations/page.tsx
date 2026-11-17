import { listUiRows, listSpecLabels } from '@/lib/admin/translations'
import { isTranslationConfigured } from '@/lib/translate'
import { PageTitle } from '@/components/admin/ui'
import TranslationsEditor from '@/components/admin/TranslationsEditor'
import { requirePermission } from '@/lib/admin/session'

export const metadata = { title: 'Translations' }

export default async function TranslationsPage() {
  await requirePermission('translations')
  const [rows, specRows] = await Promise.all([listUiRows(), listSpecLabels()])
  return (
    <>
      <PageTitle>Translations</PageTitle>
      <TranslationsEditor rows={rows} specRows={specRows} configured={isTranslationConfigured()} />
    </>
  )
}
