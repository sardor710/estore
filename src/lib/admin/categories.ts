import { prisma } from '@/lib/db'
import { cleanL10n, SLUG_RE } from '@/lib/admin/products'
import type { L10n } from '@/lib/localized'

export type CategoryInput = {
  slug: string
  name: L10n
  parentId: number | null
  sortOrder: number
  template: 'SIMPLE' | 'DETAILED'
}

export type CategoryResult = { ok: true; id: number } | { ok: false; errors: Record<string, string> }

async function validate(input: CategoryInput, selfId: number | null): Promise<Record<string, string>> {
  const errors: Record<string, string> = {}
  const slug = (input.slug ?? '').trim()
  if (!SLUG_RE.test(slug)) errors.slug = 'Slug may contain only a-z, 0-9 and single dashes.'
  else {
    const clash = await prisma.category.findUnique({ where: { slug }, select: { id: true } })
    if (clash && clash.id !== selfId) errors.slug = 'This slug is already used by another category.'
  }
  if (!Object.keys(cleanL10n(input.name)).length) errors.name = 'Give the category a name in at least one language.'
  if (input.template !== 'SIMPLE' && input.template !== 'DETAILED') errors.template = 'Template must be SIMPLE or DETAILED.'
  if (!Number.isInteger(input.sortOrder)) errors.sortOrder = 'Order must be a whole number.'
  if (input.parentId !== null) {
    if (!Number.isInteger(input.parentId) || !(await prisma.category.findUnique({ where: { id: input.parentId }, select: { id: true } }))) {
      errors.parentId = 'Parent category does not exist.'
    } else if (selfId !== null) {
      // walk up from the proposed parent: must not reach this category
      let cur: number | null = input.parentId
      const seen = new Set<number>()
      while (cur !== null && !seen.has(cur)) {
        if (cur === selfId) {
          errors.parentId = 'A category cannot be its own ancestor.'
          break
        }
        seen.add(cur)
        cur = (await prisma.category.findUnique({ where: { id: cur }, select: { parentId: true } }))?.parentId ?? null
      }
    }
  }
  return errors
}

function data(input: CategoryInput) {
  return {
    slug: input.slug.trim(),
    name: cleanL10n(input.name),
    parentId: input.parentId,
    sortOrder: input.sortOrder,
    template: input.template,
  }
}

export async function createCategory(input: CategoryInput): Promise<CategoryResult> {
  const errors = await validate(input, null)
  if (Object.keys(errors).length) return { ok: false, errors }
  const c = await prisma.category.create({ data: data(input) })
  return { ok: true, id: c.id }
}

export async function updateCategory(id: number, input: CategoryInput): Promise<CategoryResult> {
  if (!(await prisma.category.findUnique({ where: { id }, select: { id: true } }))) return { ok: false, errors: { _: 'Category not found.' } }
  const errors = await validate(input, id)
  if (Object.keys(errors).length) return { ok: false, errors }
  await prisma.category.update({ where: { id }, data: data(input) })
  return { ok: true, id }
}
