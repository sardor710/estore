import { prisma } from '@/lib/db'
import { getProductBySlug, type ProductDetail } from '@/lib/catalog'
import { defaultLocale, locales, type Locale } from '@/i18n/routing'

/**
 * A product as the storefront template would render it, drafts included (staff-only preview). Prices go
 * through the same promotion pricing as the storefront (getProductBySlug). `locale` falls back to the
 * default for anything that is not a shop locale.
 */
export async function getProductForPreview(id: number, locale: string): Promise<{ product: ProductDetail; locale: Locale } | null> {
  if (!Number.isInteger(id)) return null
  const row = await prisma.product.findUnique({ where: { id }, select: { slug: true } })
  if (!row) return null
  const product = await getProductBySlug(row.slug, { includeDraft: true })
  if (!product) return null
  return { product, locale: (locales as readonly string[]).includes(locale) ? (locale as Locale) : defaultLocale }
}
