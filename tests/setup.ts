process.env.DATABASE_URL = 'file:./test.db'

import { beforeEach } from 'vitest'

beforeEach(async () => {
  const { prisma } = await import('@/lib/db')
  await prisma.orderLine.deleteMany()
  await prisma.order.deleteMany()
  await prisma.variant.deleteMany()
  await prisma.product.deleteMany()
  await prisma.category.deleteMany()
  await prisma.specLabel.deleteMany()
  await prisma.setting.deleteMany()
  await prisma.uiString.deleteMany()
})
