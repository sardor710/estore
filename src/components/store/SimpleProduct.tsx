import { getTranslations } from 'next-intl/server'
import { Check, ChevronDown } from 'lucide-react'
import type { CardProduct, ProductDetail } from '@/lib/catalog'
import type { Locale } from '@/i18n/routing'
import { t as l10n } from '@/lib/localized'
import { sanitizeHtml } from '@/lib/sanitize'
import ProductHero from './ProductHero'
import ProductGrid from './ProductGrid'

function humanize(key: string): string {
  const s = key.replace(/[-_]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Port of the legacy ProductPage layout: gallery, colors, features + specs accordions. */
export default async function SimpleProduct({
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
  const features = product.highlights.map((h) => ({ title: l10n(h.title, locale), value: h.value })).filter((h) => h.title)
  const label = (key: string) => l10n(product.specLabels[key], locale) || humanize(key)
  const specRows = product.specs.flatMap((g) => (Array.isArray(g.items) ? g.items : []))

  const accordion = 'group border-b border-neutral-100'
  const summary = 'flex w-full cursor-pointer list-none items-center justify-between py-3.5 text-left text-xs font-bold uppercase tracking-wider text-neutral-900'

  return (
    <article data-template="simple">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <ProductHero
          locale={locale}
          template="SIMPLE"
          title={product.title}
          subtitle={product.subtitle}
          shortSpec={product.shortSpec}
          badge={product.badge}
          categoryName={l10n(product.category.name, locale)}
          images={product.images}
          variants={product.variants}
        >
          <div className="mt-6 space-y-4">
            {description && <div className="rich-content text-sm" dangerouslySetInnerHTML={{ __html: description }} />}
            <div className="border-t border-neutral-100">
              {features.length > 0 && (
                <details className={accordion} open>
                  <summary className={summary}>
                    <span>{t('features')}</span>
                    <ChevronDown size={15} className="transition group-open:rotate-180" aria-hidden />
                  </summary>
                  <ul className="space-y-2 pb-4 text-xs text-neutral-600">
                    {features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                        <span>{f.value ? `${f.value} ${f.title}` : f.title}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {specRows.length > 0 && (
                <details className={accordion} open>
                  <summary className={summary}>
                    <span>{t('specs')}</span>
                    <ChevronDown size={15} className="transition group-open:rotate-180" aria-hidden />
                  </summary>
                  <dl className="space-y-0 pb-4 text-xs text-neutral-600">
                    {specRows.map((row, i) => (
                      <div key={`${row.label}-${i}`} className="flex justify-between gap-4 border-b border-neutral-50 py-1.5">
                        <dt className="font-semibold text-neutral-800">{label(row.label)}</dt>
                        <dd className="max-w-[60%] text-right">{l10n(row.valueL10n, locale) || row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </div>
          </div>
        </ProductHero>
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
