import { listUiRows, listSpecLabels } from '@/lib/admin/translations'
import { isTranslationConfigured } from '@/lib/translate'
import { PageHeader } from '@/components/admin/ui'
import TranslationsEditor from '@/components/admin/TranslationsEditor'
import { requirePermission } from '@/lib/admin/session'

export const metadata = { title: 'Translations' }

export default async function TranslationsPage() {
  await requirePermission('translations')
  const [rows, specRows] = await Promise.all([listUiRows(), listSpecLabels()])
  return (
    <>
      <PageHeader title="Translations" />
      <TranslationsEditor rows={rows} specRows={specRows} configured={isTranslationConfigured()} />
    </>
  )
}
