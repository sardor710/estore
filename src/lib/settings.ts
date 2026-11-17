import { prisma } from '@/lib/db'

export type Settings = {
  minOrderUzs: number
  telegramBotToken: string | null
  telegramChatId: string | null
  vipThresholdUzs: number
  lowStockThreshold: number
}

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany()
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const min = Number(map.get('minOrderUzs'))
  const vip = Number(map.get('vipThresholdUzs'))
  const low = Number(map.get('lowStockThreshold'))
  return {
    minOrderUzs: Number.isFinite(min) ? min : 0,
    telegramBotToken: map.get('telegramBotToken') || null,
    telegramChatId: map.get('telegramChatId') || null,
    vipThresholdUzs: map.has('vipThresholdUzs') && Number.isFinite(vip) ? vip : 10_000_000,
    lowStockThreshold: map.has('lowStockThreshold') && Number.isFinite(low) ? low : 3,
  }
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (value === null) {
      await prisma.setting.deleteMany({ where: { key } })
    } else {
      const v = String(value)
      await prisma.setting.upsert({ where: { key }, update: { value: v }, create: { key, value: v } })
    }
  }
  return getSettings()
}
