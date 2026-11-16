/**
 * Demo (sample) products are hidden from the storefront in production unless SHOW_DEMO=1.
 * In development they show, so the shop is not empty out of the box.
 */
export function demoHidden(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.SHOW_DEMO !== '1'
}

/** Prisma `where` for products a customer may see (and buy). */
export function storefrontWhere(): { status: 'PUBLISHED'; isDemo?: false } {
  return demoHidden() ? { status: 'PUBLISHED', isDemo: false } : { status: 'PUBLISHED' }
}

/** Same rule for a loaded product row. */
export function isSellable(p: { status: string; isDemo: boolean }): boolean {
  return p.status === 'PUBLISHED' && !(p.isDemo && demoHidden())
}
