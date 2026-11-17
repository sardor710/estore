import 'dotenv/config'
import { prisma } from '../src/lib/db'
import { DEMO_PRODUCTS } from './demo-data'

const USD_TO_UZS = 12800

const CATEGORY_BY_PRODUCT: Record<string, string> = {
  'modern-leather-case': 'cases-accessories',
  'traditional-leather-case': 'cases-accessories',
  'sport-band': 'cases-accessories',
  'card-wallet-plus': 'cases-accessories',
  chargekey: 'cables-hubs',
  'stand-one-max': 'chargers',
}

const toUzs = (usd: number) => Math.round((usd * USD_TO_UZS) / 1000) * 1000
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function main() {
  // Spec group label (translated; the per-spec labels are English-only until an admin translates them).
  await prisma.specLabel.upsert({
    where: { key: 'general' },
    update: {},
    create: { key: 'general', label: { uz: 'Umumiy', ru: 'Общее', en: 'General' } },
  })

  let count = 0
  for (const d of DEMO_PRODUCTS) {
    const categorySlug = CATEGORY_BY_PRODUCT[d.id]
    if (!categorySlug) throw new Error(`No category mapping for demo product ${d.id}`)
    const category = await prisma.category.findUnique({ where: { slug: categorySlug } })
    if (!category) throw new Error(`Category ${categorySlug} missing - run "npm run seed" first`)

    const items = []
    for (const [label, value] of Object.entries(d.specs)) {
      const key = slugify(label)
      await prisma.specLabel.upsert({ where: { key }, update: {}, create: { key, label: { en: label } } })
      items.push({ label: key, value })
    }

    const data = {
      categoryId: category.id,
      status: 'PUBLISHED',
      isDemo: true,
      badge: d.badge,
      title: { en: d.name },
      subtitle: { en: d.tagline },
      shortSpec: { en: d.subName },
      descriptionHtml: { en: `<p>${esc(d.description)}</p>` },
      sections: [],
      highlights: d.features.map((f) => ({ title: { en: f } })),
      inTheBox: [],
      faq: [],
      specs: [{ group: 'general', items }],
      images: d.images,
      reviewed: { uz: false, ru: false },
    }
    const product = await prisma.product.upsert({
      where: { slug: d.handle },
      update: data,
      create: { slug: d.handle, ...data },
    })

    for (const [i, c] of d.colors.entries()) {
      const vdata = {
        productId: product.id,
        name: { en: c.name },
        colorHex: c.hex,
        imageIndex: c.imageIndex,
        priceUzs: toUzs(d.price),
        compareAtUzs: d.compareAtPrice != null ? toUzs(d.compareAtPrice) : null,
        stock: 25,
        sortOrder: i,
      }
      const sku = `DEMO-${d.id}-${c.id}`.toUpperCase()
      await prisma.variant.upsert({ where: { sku }, update: vdata, create: { sku, ...vdata } })
    }
    count += 1
  }
  console.log(`Seeded ${count} demo products.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
