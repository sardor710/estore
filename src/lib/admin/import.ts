import { importAnkerProduct, refreshAnkerProduct, ImportError, normalizeAnkerUrl } from '@/lib/importer/anker'
import { translateProduct, TranslationError } from '@/lib/translate'

const IMPORT_MESSAGES: Record<string, string> = {
  BAD_URL: 'That is not a valid Anker product URL. Use a link like https://www.anker.com/products/<name>.',
  FETCH_FAILED: 'Could not download the Anker page (network problem or Anker blocked the request). Try again in a minute.',
  NOT_FOUND: 'Anker says this product page does not exist (404). Check the link.',
  PARSE_FAILED: 'The page was downloaded but its product data could not be read. The page layout may have changed.',
}

export function importErrorMessage(code: string): string {
  return IMPORT_MESSAGES[code] ?? 'Import failed.'
}

export type Deps = {
  importProduct: typeof importAnkerProduct
  translate: typeof translateProduct
}
const defaultDeps: Deps = { importProduct: importAnkerProduct, translate: translateProduct }

export type ImportOutcome =
  | { ok: true; productId: number; created: boolean; translation?: 'done' | 'not_configured' | 'failed'; notice?: string }
  | { ok: false; code: string; message: string }

/** Import (or detect an already imported) Anker product, then machine-translate it when newly created. */
export async function runImport(url: string, categoryId: number | undefined, deps: Deps = defaultDeps): Promise<ImportOutcome> {
  try {
    const { productId, created } = await deps.importProduct(url, { categoryId })
    if (!created) return { ok: true, productId, created: false }
    try {
      const t = await deps.translate(productId)
      if (t.status === 'not_configured') {
        return { ok: true, productId, created: true, translation: 'not_configured', notice: 'Imported. Translation is not configured (no ANTHROPIC_API_KEY), so uz and ru texts are empty.' }
      }
      return { ok: true, productId, created: true, translation: 'done' }
    } catch (e) {
      const msg = e instanceof TranslationError ? e.message : e instanceof Error ? e.message : 'unknown error'
      return { ok: true, productId, created: true, translation: 'failed', notice: `Imported, but translation failed: ${msg}. Use "Translate from EN" in the editor to retry.` }
    }
  } catch (e) {
    if (e instanceof ImportError) return { ok: false, code: e.code, message: importErrorMessage(e.code) }
    return { ok: false, code: 'ERROR', message: e instanceof Error ? e.message : 'Import failed.' }
  }
}

/** Existing product id for a URL (after normalising), or null. */
export async function findImported(url: string): Promise<number | null> {
  const { prisma } = await import('@/lib/db')
  try {
    const p = await prisma.product.findUnique({ where: { sourceUrl: normalizeAnkerUrl(url) }, select: { id: true } })
    return p?.id ?? null
  } catch {
    return null
  }
}

export async function runRefresh(productId: number): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await refreshAnkerProduct(productId)
    return { ok: true }
  } catch (e) {
    if (e instanceof ImportError) return { ok: false, message: importErrorMessage(e.code) }
    return { ok: false, message: e instanceof Error ? e.message : 'Refresh failed.' }
  }
}
