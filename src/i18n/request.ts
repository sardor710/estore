import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { defaultLocale, routing, type Locale } from './routing'

export async function loadMessages(locale: Locale) {
  return (await import(`../../messages/${locale}.json`)).default
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale: Locale = hasLocale(routing.locales, requested) ? requested : defaultLocale
  return { locale, messages: await loadMessages(locale) }
})
