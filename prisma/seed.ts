import 'dotenv/config'
import { prisma } from '../src/lib/db'

type Cat = {
  slug: string
  template: 'SIMPLE' | 'DETAILED'
  parent?: string
  uz: string
  ru: string
  en: string
}

const categories: Cat[] = [
  { slug: 'chargers', template: 'DETAILED', uz: 'Zaryadlovchi qurilmalar', ru: 'Зарядные устройства', en: 'Chargers' },
  { slug: 'power-banks', template: 'DETAILED', uz: 'Power bank', ru: 'Портативные аккумуляторы', en: 'Power banks' },
  { slug: 'audio', template: 'DETAILED', uz: 'Audio', ru: 'Аудио', en: 'Audio' },
  { slug: 'earbuds', template: 'DETAILED', parent: 'audio', uz: 'Quloqchinlar', ru: 'Наушники-вкладыши', en: 'Earbuds' },
  { slug: 'headphones', template: 'DETAILED', parent: 'audio', uz: 'Naushniklar', ru: 'Накладные наушники', en: 'Headphones' },
  { slug: 'speakers', template: 'DETAILED', parent: 'audio', uz: 'Karnaylar', ru: 'Колонки', en: 'Speakers' },
  { slug: 'wearables', template: 'DETAILED', uz: 'Aqlli taqiladigan qurilmalar', ru: 'Носимые устройства', en: 'Wearables' },
  { slug: 'smartwatches', template: 'DETAILED', parent: 'wearables', uz: 'Aqlli soatlar', ru: 'Умные часы', en: 'Smartwatches' },
  { slug: 'cameras-smart-home', template: 'DETAILED', uz: 'Kameralar va aqlli uy', ru: 'Камеры и умный дом', en: 'Cameras & smart home' },
  { slug: 'cables-hubs', template: 'SIMPLE', uz: 'Kabellar va xablar', ru: 'Кабели и хабы', en: 'Cables & hubs' },
  { slug: 'cases-accessories', template: 'SIMPLE', uz: 'Chexollar va aksessuarlar', ru: 'Чехлы и аксессуары', en: 'Cases & accessories' },
]

async function main() {
  const ids = new Map<string, number>()
  let sortOrder = 0
  for (const c of categories) {
    sortOrder += 1
    const data = {
      template: c.template,
      sortOrder,
      parentId: c.parent ? ids.get(c.parent)! : null,
      name: { uz: c.uz, ru: c.ru, en: c.en },
    }
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: data,
      create: { slug: c.slug, ...data },
    })
    ids.set(c.slug, row.id)
  }

  const defaults: Record<string, string> = { minOrderUzs: '0' }
  for (const [key, value] of Object.entries(defaults)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } })
  }
  console.log(`Seeded ${categories.length} categories and default settings.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
