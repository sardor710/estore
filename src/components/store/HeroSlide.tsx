import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { PublicBanner } from '@/lib/banners'

const ctaClass =
  'inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-xs font-semibold tracking-wide text-black shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-neutral-200 sm:text-sm'

const isExternal = (href: string) => /^https?:\/\//i.test(href)

function SmartLink({ href, className, children, tabIndex, label }: { href: string; className: string; children?: React.ReactNode; tabIndex?: number; label?: string }) {
  if (isExternal(href)) {
    return (
      <a href={href} className={className} tabIndex={tabIndex} aria-label={label} rel="noopener">
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={className} tabIndex={tabIndex} aria-label={label}>
      {children}
    </Link>
  )
}

/**
 * One image banner slide: picture (separate mobile image when set), dark overlay for legible text, localized copy and CTA.
 * Shared by the storefront hero and the admin live preview (`preview`: links are inert, no navigation).
 */
export default function HeroSlide({
  banner,
  active = true,
  first = false,
  preview = false,
  fallbackHeading = '',
}: {
  banner: PublicBanner
  active?: boolean
  /** First slide of the page: eager, high-priority image and the page's <h1>. */
  first?: boolean
  preview?: boolean
  /** Localized page heading used (visually hidden) when the first slide has no title, and as the label of a whole-slide link. */
  fallbackHeading?: string
}) {
  const { title, text, buttonText, href, imageUrl, mobileImageUrl } = banner
  const showButton = Boolean(buttonText && href)
  const wholeSlideLink = Boolean(href && !buttonText)
  const hasCopy = Boolean(title || text || showButton)
  const tab = active ? 0 : -1
  const Heading = first && !preview ? 'h1' : 'p'

  return (
    <>
      {first && !preview && !title && fallbackHeading ? <h1 className="sr-only">{fallbackHeading}</h1> : null}
      <picture>
        {mobileImageUrl ? <source media="(max-width: 640px)" srcSet={mobileImageUrl} /> : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover"
          loading={first ? 'eager' : 'lazy'}
          fetchPriority={first ? 'high' : 'auto'}
          decoding="async"
        />
      </picture>
      {hasCopy ? <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent sm:bg-gradient-to-r sm:from-black/70 sm:via-black/25" /> : null}
      {wholeSlideLink && href && !preview ? <SmartLink href={href} className="absolute inset-0 z-10" tabIndex={tab} label={title || fallbackHeading || undefined} /> : null}
      {hasCopy ? (
        <div className="pointer-events-none relative z-20 mx-auto flex h-full max-w-7xl flex-col justify-end px-6 pb-16 sm:px-8 sm:pb-24">
          <div className="max-w-xl space-y-4">
            {title ? (
              <Heading className="font-[family-name:var(--font-heading)] text-4xl font-extrabold leading-[0.95] tracking-tighter text-white drop-shadow-md sm:text-6xl lg:text-7xl">
                {title}
              </Heading>
            ) : null}
            {text ? <p className="max-w-md whitespace-pre-line text-sm leading-relaxed text-neutral-200 sm:text-base">{text}</p> : null}
            {showButton && href ? (
              <div className="pointer-events-auto pt-2">
                {preview ? (
                  <span className={ctaClass}>
                    {buttonText} <ArrowRight size={15} aria-hidden />
                  </span>
                ) : (
                  <SmartLink href={href} className={ctaClass} tabIndex={tab}>
                    {buttonText} <ArrowRight size={15} aria-hidden />
                  </SmartLink>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
