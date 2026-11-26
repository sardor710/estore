import 'dotenv/config'
import { queueProductImages, kickImageTranslations } from '../src/lib/image-translate/service'

async function main() {
  const id = Number(process.argv[2])
  if (!Number.isInteger(id)) throw new Error('usage: tsx scripts/translate-images.ts <productId>')
  console.log('queued', await queueProductImages(id))
  await kickImageTranslations()
  console.log('done')
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
