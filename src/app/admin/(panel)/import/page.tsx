import { prisma } from '@/lib/db'
import { PageTitle, Notice } from '@/components/admin/ui'
import ImportForm from '@/components/admin/ImportForm'
import { isTranslationConfigured } from '@/lib/translate'
import type { L10n } from '@/lib/localized'
import { requirePermission } from '@/lib/admin/session'

export const metadata = { title: 'Import' }

export default async function ImportPage() {
  await requirePermission('catalog')
  const cats = await prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
  const categories = cats.map((c) => {
    const n = (c.name ?? {}) as L10n
    return { id: c.id, label: n.en || n.uz || n.ru || c.slug }
  })
  const def = cats.find((c) => c.slug === 'chargers') ?? cats[0]
  return (
    <>
      <PageTitle>Import from Anker</PageTitle>
      <div className="mb-4 space-y-3">
        <p className="text-sm text-neutral-600">
          Paste a product link from anker.com. The product is created as a draft with prices 0 and stock 0; set prices, review the texts, then publish.
        </p>
        {!isTranslationConfigured() ? <Notice kind="warn">Translation is not configured, so uz/ru texts will be empty after import (set ANTHROPIC_API_KEY).</Notice> : null}
      </div>
      <ImportForm categories={categories} defaultCategoryId={def?.id ?? null} />
    </>
  )
}
