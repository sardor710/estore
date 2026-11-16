import 'dotenv/config'
import { prisma } from '../src/lib/db'
import { importAnkerProduct, ImportError } from '../src/lib/importer/anker'

async function main() {
  const urls = process.argv.slice(2)
  if (urls.length === 0) {
    console.error('usage: tsx scripts/try-import.ts <anker product url...>')
    process.exit(2)
  }
  for (const url of urls) {
    try {
      const { productId, created } = await importAnkerProduct(url)
      const p = await prisma.product.findUniqueOrThrow({ where: { id: productId }, include: { variants: true } })
      const title = (p.title as { en?: string }).en
      const specGroups = (p.specs as unknown[]).length
      const images = (p.images as unknown[]).length
      console.log(
        `OK   ${url}\n     id=${productId} ${created ? 'created' : 'already existed'} title="${title}" variants=${p.variants.length} images=${images} specGroups=${specGroups}`,
      )
    } catch (e) {
      if (e instanceof ImportError) console.log(`FAIL ${url}\n     ImportError ${e.code}: ${e.message}`)
      else console.log(`FAIL ${url}\n     ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
main().finally(() => prisma.$disconnect())
