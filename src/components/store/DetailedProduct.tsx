import { getTranslations } from 'next-intl/server'
import { BatteryCharging, Bluetooth, Check, Clock, Headphones, Plug, ShieldCheck, Volume2, Wifi, Zap, type LucideIcon } from 'lucide-react'
import type { CardProduct, ProductDetail } from '@/lib/catalog'
import type { Locale } from '@/i18n/routing'
import { t as l10n } from '@/lib/localized'
import { sanitizeHtml } from '@/lib/sanitize'
import ProductHero from './ProductHero'
import SpecTable from './SpecTable'
import ProductGrid from './ProductGrid'
import OverviewBanner from './OverviewBanner'

const ICONS: Record<string, LucideIcon> = {
  zap: Zap,
  power: Zap,
  battery: BatteryCharging,
  charging: BatteryCharging,
  headphones: Headphones,
  audio: Volume2,
  sound: Volume2,
  wifi: Wifi,
  bluetooth: Bluetooth,
  shield: ShieldCheck,
  warranty: ShieldCheck,
  clock: Clock,
  plug: Plug,
}

export default async function DetailedProduct({
  product,
  related,
  locale,
}: {
  product: ProductDetail
  related: CardProduct[]
  locale: Locale
}) {
  const t = await getTranslations({ locale, namespace: 'product' })
  const description = sanitizeHtml(l10n(product.descriptionHtml, locale))
  const inTheBox = product.inTheBox.map((i) => l10n(i, locale)).filter(Boolean)
  const faq = product.faq.filter((f) => !f.hidden && l10n(f.q, locale))
  const visible = product.sections.filter((s) => !s.hidden)
  const textSections = visible.filter((s) => s.layout !== 'banner')
  const banners = visible.filter((s) => s.layout === 'banner' && s.image)
  // Banners are the overview story; they no longer hide the description (only hand-written text sections do).
  const showDescription = Boolean(description) && textSections.length === 0

  return (
    <article data-template="detailed">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <ProductHero
          locale={locale}
          productId={product.id}
          template="DETAILED"
          title={product.title}
          subtitle={product.subtitle}
          shortSpec={product.shortSpec}
          badge={product.badge}
          categoryName={l10n(product.category.name, locale)}
          images={product.images}
          variants={product.variants}
        />
      </div>

      {product.highlights.length > 0 && (
        <section aria-labelledby="highlights-h" className="border-y border-neutral-100 bg-neutral-50">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <h2 id="highlights-h" className="sr-only">
              {t('highlights')}
            </h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
              {product.highlights.map((h, i) => {
                const Icon = (h.icon && ICONS[h.icon.toLowerCase()]) || Check
                return (
                  <li key={i} className="flex flex-col gap-2 border-l-2 border-neutral-900 pl-4">
                    {h.value ? (
                      <span className="font-[family-name:var(--font-heading)] text-3xl font-extrabold tracking-tight text-neutral-950 sm:text-4xl">
                        {h.value}
                      </span>
                    ) : (
                      <Icon size={22} className="text-neutral-900" aria-hidden />
                    )}
                    <span className="text-sm leading-snug text-neutral-600">{l10n(h.title, locale)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      )}

      {(showDescription || textSections.length > 0) && (
      <div className="mx-auto max-w-7xl space-y-16 px-4 pt-14 sm:px-6 lg:px-8 lg:pt-20">
        {showDescription && (
          <section aria-labelledby="about-h" className="max-w-3xl">
            <h2 id="about-h" className="mb-4 text-2xl font-extrabold tracking-tight text-neutral-900">
              {t('about')}
            </h2>
            <div className="rich-content" dangerouslySetInnerHTML={{ __html: description }} />
          </section>
        )}

        {textSections.length > 0 && (
          <div className="space-y-14">
            {textSections.map((s, i) => (
              <section key={i} className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
                {s.image && (
                  <div className={`overflow-hidden rounded-2xl bg-[#f5f5f7] ${i % 2 ? 'md:order-2' : ''}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </div>
                )}
                <div className={s.image ? '' : 'max-w-3xl md:col-span-2'}>
                  <h2 className="text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl">{l10n(s.heading, locale)}</h2>
                  <p className="mt-4 whitespace-pre-line leading-relaxed text-neutral-600">{l10n(s.body, locale)}</p>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      )}

      {banners.length > 0 && (
        <div data-overview className="mt-14 lg:mt-20">
          {banners.map((s, i) => (
            <OverviewBanner key={s.sourceKey ?? i} heading={l10n(s.heading, locale)} body={l10n(s.body, locale)} image={s.image!} imageMobile={s.imageMobile} />
          ))}
        </div>
      )}

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        {product.specs.some((g) => g.items?.length) && (
          <section aria-labelledby="specs-h" className="max-w-4xl">
            <h2 id="specs-h" className="mb-6 text-2xl font-extrabold tracking-tight text-neutral-900">
              {t('specs')}
            </h2>
            <SpecTable groups={product.specs} labels={product.specLabels} locale={locale} />
          </section>
        )}

        {inTheBox.length > 0 && (
          <section aria-labelledby="box-h" className="max-w-3xl">
            <h2 id="box-h" className="mb-4 text-2xl font-extrabold tracking-tight text-neutral-900">
              {t('inTheBox')}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {inTheBox.map((item, i) => (
                <li key={i} className="flex items-start gap-2 rounded-xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                  <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {faq.length > 0 && (
          <section aria-labelledby="faq-h" className="max-w-3xl">
            <h2 id="faq-h" className="mb-4 text-2xl font-extrabold tracking-tight text-neutral-900">
              {t('faq')}
            </h2>
            <div className="divide-y divide-neutral-200 border-y border-neutral-200">
              {faq.map((f, i) => (
                <details key={i} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-neutral-900">
                    {l10n(f.q, locale)}
                    <span className="text-neutral-400 transition group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-neutral-600">{l10n(f.a, locale)}</p>
                </details>
              ))}
            </div>
          </section>
        )}
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-h" className="border-t border-neutral-200 bg-neutral-50 py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 id="related-h" className="mb-8 text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl">
              {t('related')}
            </h2>
            <ProductGrid products={related} locale={locale} />
          </div>
        </section>
      )}
    </article>
  )
}
