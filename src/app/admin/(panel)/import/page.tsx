import { prisma } from '@/lib/db'
import { PageHeader, Notice } from '@/components/admin/ui'
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
      <PageHeader
        title="Import from Anker"
        description="Paste a product link from anker.com. The product is created as a draft with prices 0 and stock 0; set prices, review the texts, then publish."
      />
      {!isTranslationConfigured() ? (
        <div className="mb-4">
          <Notice kind="warn">Translation is not configured, so uz/ru texts will be empty after import (set ANTHROPIC_API_KEY).</Notice>
        </div>
      ) : null}
      <ImportForm categories={categories} defaultCategoryId={def?.id ?? null} />
    </>
  )
}
