import type { Locale } from '@/i18n/routing'
import type { ShopDetails } from '@/lib/settings'
import en from './en'
import ru from './ru'
import uz from './uz'
import type { LegalContent } from './types'

export * from './types'

const CONTENT: Record<Locale, LegalContent> = { uz, ru, en }

export function legalContent(locale: Locale): LegalContent {
  return CONTENT[locale]
}

export const BOT_HANDLE = '@Zankouzbot'
export const SITE_HANDLE = 'zanko.uz'

/** Fills {seller}, {site} and {bot}. */
export function fillLegal(text: string, locale: Locale, shop: Pick<ShopDetails, 'shopLegalName'>): string {
  const seller = shop.shopLegalName || CONTENT[locale].labels.sellerFallback
  return text.replaceAll('{seller}', seller).replaceAll('{site}', SITE_HANDLE).replaceAll('{bot}', BOT_HANDLE)
}
