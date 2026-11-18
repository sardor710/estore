import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { routing, type Locale } from '@/i18n/routing'
import { getRegion } from '@/lib/regions'
import { t as l10n } from '@/lib/localized'

// Server-only helpers shared by the login and account pages.

export type AccountMetaKey = 'login' | 'overview' | 'orders' | 'order' | 'addresses' | 'favorites' | 'messages' | 'profile'

/** Localized title; account pages and the login page are never indexed. */
export async function accountMetadata(rawLocale: string, key: AccountMetaKey, values?: Record<string, string | number>): Promise<Metadata> {
  if (!hasLocale(routing.locales, rawLocale)) return {}
  const t = await getTranslations({ locale: rawLocale, namespace: 'account.meta' })
  return { title: t(key, values), robots: { index: false, follow: false } }
}

/** Region code -> localized name (the code itself when unknown). */
export function regionName(code: string, locale: Locale): string {
  const r = getRegion(code)
  return r ? l10n(r.name, locale) : code
}
