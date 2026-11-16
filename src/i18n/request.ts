import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { prisma } from '@/lib/db'
import { defaultLocale, routing, type Locale } from './routing'
import { applyUiOverrides } from './merge'

/** messages/<locale>.json with admin-edited UiString overrides merged on top. */
export async function loadMessages(locale: Locale) {
  const file = (await import(`../../messages/${locale}.json`)).default
  const rows = await prisma.uiString.findMany()
  return applyUiOverrides(file, locale, rows)
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale: Locale = hasLocale(routing.locales, requested) ? requested : defaultLocale
  return { locale, messages: await loadMessages(locale) }
})
