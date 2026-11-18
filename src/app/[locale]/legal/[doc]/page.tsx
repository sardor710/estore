import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { hasLocale } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { routing, type Locale } from '@/i18n/routing'
import { pageMetadata } from '@/lib/seo'
import { path } from '@/lib/paths'
import { getShopDetails, type ShopDetails } from '@/lib/settings'
import { BOT_HANDLE, fillLegal, legalContent, LEGAL_DOCS, LEGAL_UPDATED, type Block, type LegalDoc } from '@/lib/legal'

export const dynamic = 'force-dynamic'

const isDoc = (d: string): d is LegalDoc => (LEGAL_DOCS as readonly string[]).includes(d)

export async function generateMetadata({ params }: { params: Promise<{ locale: string; doc: string }> }): Promise<Metadata> {
  const { locale, doc } = await params
  if (!hasLocale(routing.locales, locale) || !isDoc(doc)) return {}
  const shop = await getShopDetails()
  const c = legalContent(locale)[doc]
  return pageMetadata({ locale, path: `/legal/${doc}`, title: c.title, description: fillLegal(c.description, locale, shop) })
}

/** Plain text with [label](/legal/x) links to other pages of this site. */
function Rich({ text, locale }: { text: string; locale: Locale }) {
  const out: ReactNode[] = []
  const re = /\[([^\]]+)\]\((\/[a-z0-9/-]+)\)/g
  let last = 0
  for (const m of text.matchAll(re)) {
    out.push(text.slice(last, m.index))
    out.push(
      <Link key={m.index} href={path(locale, m[2])} className="font-medium text-neutral-900 underline underline-offset-2 hover:text-neutral-600">
        {m[1]}
      </Link>,
    )
    last = m.index + m[0].length
  }
  out.push(text.slice(last))
  return <>{out}</>
}

function Contacts({ shop, locale }: { shop: ShopDetails; locale: Locale }) {
  const l = legalContent(locale).labels
  const tg = shop.shopTelegram
  const rows: [string, ReactNode][] = [
    [l.name, shop.shopLegalName || l.sellerFallback],
    ...(shop.shopInn ? [[l.inn, shop.shopInn] as [string, ReactNode]] : []),
    ...(shop.shopAddress ? [[l.address, shop.shopAddress] as [string, ReactNode]] : []),
    ...(shop.shopPhone ? [[l.phone, <a key="p" className="underline" href={`tel:${shop.shopPhone.replace(/[^\d+]/g, '')}`}>{shop.shopPhone}</a>] as [string, ReactNode]] : []),
    ...(shop.shopEmail ? [[l.email, <a key="e" className="underline" href={`mailto:${shop.shopEmail}`}>{shop.shopEmail}</a>] as [string, ReactNode]] : []),
    [l.telegram, <a key="t" className="underline" href={`https://t.me/${(tg || BOT_HANDLE).slice(1)}`} target="_blank" rel="noopener noreferrer">{tg || BOT_HANDLE}</a>],
    ...(shop.shopHours ? [[l.hours, shop.shopHours] as [string, ReactNode]] : []),
  ]
  return (
    <dl className="grid gap-x-6 gap-y-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm sm:grid-cols-[10rem_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-neutral-700">{k}</dt>
          <dd className="text-neutral-800">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function BlockView({ block, locale, shop }: { block: Block; locale: Locale; shop: ShopDetails }) {
  if (typeof block === 'string') return <p><Rich text={fillLegal(block, locale, shop)} locale={locale} /></p>
  if ('ul' in block)
    return (
      <ul className="list-disc space-y-1.5 pl-5">
        {block.ul.map((li, i) => (
          <li key={i}><Rich text={fillLegal(li, locale, shop)} locale={locale} /></li>
        ))}
      </ul>
    )
  return <Contacts shop={shop} locale={locale} />
}

export default async function LegalPage({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale: raw, doc } = await params
  if (!isDoc(doc)) notFound()
  setRequestLocale(raw)
  const locale = raw as Locale
  const content = legalContent(locale)
  const c = content[doc]
  const shop = await getShopDetails()
  const updated = new Date(`${LEGAL_UPDATED}T12:00:00Z`).toLocaleDateString(locale === 'uz' ? 'uz-Latn-UZ' : locale === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <nav aria-label={content.labels.footer} className="mb-6 flex flex-wrap gap-2 text-sm">
        {LEGAL_DOCS.map((d) => (
          <Link
            key={d}
            href={path(locale, `/legal/${d}`)}
            aria-current={d === doc ? 'page' : undefined}
            className={`rounded-full px-3 py-1 ${d === doc ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
          >
            {content.labels.short[d]}
          </Link>
        ))}
      </nav>
      <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">{c.title}</h1>
      <p className="mt-2 text-neutral-600">{fillLegal(c.description, locale, shop)}</p>
      <p className="mt-1 text-xs text-neutral-500">
        {content.labels.updated}: {updated}
      </p>
      <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-neutral-700">
        {c.sections.map((s) => (
          <section key={s.h} className="space-y-3">
            <h2 className="text-lg font-bold text-neutral-900">{s.h}</h2>
            {s.blocks.map((b, i) => (
              <BlockView key={i} block={b} locale={locale} shop={shop} />
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
