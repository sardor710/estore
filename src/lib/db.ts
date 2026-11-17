import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@/generated/prisma/client'

// Dev: the client is cached on globalThis so hot reloads don't open new connections. The cache is keyed by the
// generated PrismaClient class: after `prisma generate` (e.g. a new model) the class changes and a fresh client is
// created, instead of a stale one that lacks the new model (`prisma.banner` undefined).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaClass?: typeof PrismaClient }

function create(): PrismaClient {
  const url = process.env.DATABASE_URL ?? 'file:./dev.db'
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })
}

const cached = globalForPrisma.prismaClass === PrismaClient ? globalForPrisma.prisma : undefined
if (globalForPrisma.prisma && !cached) void globalForPrisma.prisma.$disconnect().catch(() => {})

export const prisma = cached ?? create()
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaClass = PrismaClient
}
