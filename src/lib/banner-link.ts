// Dependency-free (client-safe): used by the banner admin form, its live preview and the storefront query.
import { locales, type Locale } from '@/i18n/routing'
import { isHttpUrl } from '@/lib/admin/products-shared'
import { path } from '@/lib/paths'

// A site path: one leading slash, then no second slash/backslash (protocol-relative "//host" or "/\host"), no spaces or control chars.
const SITE_PATH_RE = /^\/(?![/\\])[^\s\\\u0000-\u001f]*$/

/** Banner link: empty (no link), a site path like `/c/chargers`, or an absolute http(s) URL. */
export function isValidBannerLink(s: string): boolean {
  if (s === '') return true
  if (/\s/.test(s)) return false
  return SITE_PATH_RE.test(s) || isHttpUrl(s)
}

const LOCALE_PREFIX_RE = new RegExp(`^/(${locales.join('|')})(?=$|[/?#])`)

/** Href for a stored banner link: site paths get the viewer's locale prefix (unless they already carry one); null when there is no usable link. */
export function bannerHref(locale: Locale, linkUrl: string | null | undefined): string | null {
  if (!linkUrl || !isValidBannerLink(linkUrl)) return null
  if (isHttpUrl(linkUrl)) return linkUrl
  return LOCALE_PREFIX_RE.test(linkUrl) ? linkUrl : path(locale, linkUrl)
}
