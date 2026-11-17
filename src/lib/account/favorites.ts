import { prisma } from '@/lib/db'
import { storefrontWhere, isSellable } from '@/lib/visibility'
import { loadPricer } from '@/lib/promotions'
import { toCard, type CardProduct } from '@/lib/catalog'

// Favorites of a signed-in customer (no guest favorites). Scoped by the session's customer id.

/**
 * Toggles a favorite and returns the resulting state (true = now a favorite). Adding is allowed only for
 * products visible on the storefront (PUBLISHED, demo rules); removing always works. Unknown/draft -> false.
 */
export async function toggleFavorite(cid: number, productId: number): Promise<boolean> {
  if (!Number.isSafeInteger(productId) || productId <= 0) return false
  const removed = await prisma.favorite.deleteMany({ where: { customerId: cid, productId } })
  if (removed.count > 0) return false
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { status: true, isDemo: true } })
  if (!p || !isSellable(p)) return false
  await prisma.favorite.upsert({
    where: { customerId_productId: { customerId: cid, productId } },
    update: {},
    create: { customerId: cid, productId },
  })
  return true
}

/** Product ids the customer has favorited (for hearts on cards), newest first. */
export async function favoriteIds(cid: number): Promise<number[]> {
  const rows = await prisma.favorite.findMany({ where: { customerId: cid }, select: { productId: true }, orderBy: { createdAt: 'desc' } })
  return rows.map((r) => r.productId)
}

/**
 * Card data for the favorites page (most recently favorited first; same cards as the catalog, see `toCard`).
 * Products no longer on the storefront are left out (the favorite row stays; un-hearting still works).
 */
export async function listFavorites(cid: number): Promise<CardProduct[]> {
  const [favs, price] = await Promise.all([
    prisma.favorite.findMany({
      where: { customerId: cid, product: storefrontWhere() },
      orderBy: { createdAt: 'desc' },
      include: { product: { include: { variants: true } } },
    }),
    loadPricer(),
  ])
  return favs.map((f) => toCard(f.product, price))
}
