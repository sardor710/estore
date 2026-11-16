import 'dotenv/config'
import { prisma } from '../src/lib/db'
import { translateProduct, isTranslationConfigured, TranslationError } from '../src/lib/translate'

async function main() {
  const id = Number(process.argv[2])
  if (!Number.isInteger(id)) {
    console.error('usage: tsx scripts/try-translate.ts <productId> [--force]')
    process.exit(2)
  }
  if (!isTranslationConfigured()) {
    console.log('NOT CONFIGURED: set ANTHROPIC_API_KEY in .env')
    return
  }
  try {
    const r = await translateProduct(id, { force: process.argv.includes('--force') })
    const p = await prisma.product.findUniqueOrThrow({ where: { id } })
    const t = p.title as Record<string, string>
    console.log(`${r.status} translated=${r.translated}\n en: ${t.en}\n uz: ${t.uz}\n ru: ${t.ru}`)
  } catch (e) {
    console.log(`FAIL ${e instanceof TranslationError ? 'TranslationError: ' : ''}${e instanceof Error ? e.message : String(e)}`)
  }
}
main().finally(() => prisma.$disconnect())
