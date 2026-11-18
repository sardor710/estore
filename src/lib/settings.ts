import { prisma } from '@/lib/db'

export type Settings = {
  minOrderUzs: number
  telegramBotToken: string | null
  telegramChatId: string | null
  vipThresholdUzs: number
  lowStockThreshold: number
} & ShopDetails

/** Seller details shown in the footer and the legal pages (public offer, privacy, warranty). Empty = not shown. */
export type ShopDetails = {
  shopLegalName: string | null
  shopInn: string | null
  shopAddress: string | null
  shopPhone: string | null
  shopEmail: string | null
  shopTelegram: string | null
  shopHours: string | null
}
export const SHOP_DETAIL_KEYS = ['shopLegalName', 'shopInn', 'shopAddress', 'shopPhone', 'shopEmail', 'shopTelegram', 'shopHours'] as const

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
    ...shopDetailsOf(map),
  }
}

function shopDetailsOf(map: Map<string, string>): ShopDetails {
  const out = {} as ShopDetails
  for (const k of SHOP_DETAIL_KEYS) out[k] = map.get(k)?.trim() || null
  return out
}

/** Public seller details only (safe for storefront pages; never the bot token). */
export async function getShopDetails(): Promise<ShopDetails> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...SHOP_DETAIL_KEYS] } } })
  return shopDetailsOf(new Map(rows.map((r) => [r.key, r.value])))
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
