'use client'

import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Copy, ExternalLink, Eye, Languages, Sparkles, X } from 'lucide-react'
import { duplicateProductAction, publishAction, saveProductAction, translateProductAction } from '@/app/admin/actions/products'
import { suggestSeoAction } from '@/app/admin/actions/seo'
import {
  COMPLETENESS_CHECKS,
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  baselineFromEditor,
  checkPublishable,
  completeness,
  type EditBaseline,
  type ProductInput,
} from '@/lib/admin/products-shared'
import type { EditorProduct, ProductPromotion } from '@/lib/admin/product-view'
import { locales } from '@/i18n/routing'
import type { L10n } from '@/lib/localized'
import { Badge, btn, btnGhost, card, input, Label, Notice } from './ui'
import L10nField from './L10nField'
import L10nRichField from './L10nRichField'
import VariantEditor from './VariantEditor'
import SpecEditor from './SpecEditor'
import ImagesEditor from './ImagesEditor'
import ImageTranslationsPanel from './ImageTranslationsPanel'
import { remapImageIndex } from '@/lib/admin/variant-display'
import { FaqEditor, HighlightsEditor, InTheBoxEditor, SectionsEditor } from './ContentEditor'

type Option = { id: number; label: string }
type Msg = { kind: 'ok' | 'error' | 'warn' | 'info'; text: string } | null

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'content', label: 'Content' },
  { id: 'variants', label: 'Variants & stock' },
  { id: 'images', label: 'Images' },
  { id: 'specs', label: 'Specs' },
  { id: 'seo', label: 'SEO' },
  { id: 'promotions', label: 'Promotions' },
] as const
type TabId = (typeof TABS)[number]['id']

/** Which tab shows each server-side validation error. */
const ERROR_TAB: Record<string, TabId> = { slug: 'general', categoryId: 'general', brandId: 'general', templateOverride: 'general', variants: 'variants', images: 'images', specs: 'specs', seo: 'seo' }

function Section({ title, children, error, id }: { title: string; children: ReactNode; error?: string; id: string }) {
  return (
    <section className={card} aria-labelledby={id}>
      <h2 id={id} className="mb-4 border-b border-neutral-100 pb-3 text-base font-semibold text-neutral-900">
        {title}
      </h2>
      {error ? (
        <div className="mb-3">
          <Notice kind="error">{error}</Notice>
        </div>
      ) : null}
      <div className="space-y-4">{children}</div>
    </section>
  )
}

/** One SEO text per locale with a live character counter (the limit is enforced on save). */
function SeoInput({ label, value, max, multiline, placeholder, onChange }: { label: string; value: string; max: number; multiline?: boolean; placeholder?: string; onChange: (v: string) => void }) {
  const over = value.length > max
  const common = {
    value,
    placeholder,
    'aria-invalid': over,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    className: `${input} ${over ? '!border-red-400' : ''}`,
  }
  return (
    <label className="block">
      <span className="mb-1 flex items-end justify-between gap-2">
        <Label>{label}</Label>
        <span className={`text-xs tabular-nums ${over ? 'font-semibold text-red-700' : 'text-neutral-500'}`} aria-live="polite">
          {value.length}/{max}
        </span>
      </span>
      {multiline ? <textarea rows={3} {...common} /> : <input {...common} />}
    </label>
  )
}

const PROMO_VIA = { product: 'this product', category: 'its category', brand: 'its brand' } as const

export default function ProductEditor({
  product,
  categories,
  brands,
  promotions,
  initialNotice,
}: {
  product: EditorProduct
  categories: Option[]
  brands: Option[]
  promotions: ProductPromotion[]
  initialNotice?: string
}) {
  const router = useRouter()
  const [data, setData] = useState<ProductInput>(product.input)
  const [labels, setLabels] = useState<Record<string, L10n>>(product.labels)
  const [status, setStatus] = useState(product.status)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<Msg>(initialNotice ? { kind: 'warn', text: initialNotice } : null)
  const [dirty, setDirty] = useState(false)
  const [force, setForce] = useState(false)
  const [pending, start] = useTransition()
  // What this editor loaded: saves are rejected when the product or its stock changed since.
  const [base, setBase] = useState<EditBaseline>(() => baselineFromEditor(product))
  // The rich-text editor is uncontrolled after mount: bump to reload it with content from the DB.
  const [version, setVersion] = useState(0)
  const [tab, setTab] = useState<TabId>('general')
  // Panels mount on first visit and then stay mounted (hidden), so the lazy rich-text editor loads only when needed.
  const [visited, setVisited] = useState<Set<TabId>>(() => new Set(['general']))
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const patch = (p: Partial<ProductInput>) => {
    setData((d) => ({ ...d, ...p }))
    setDirty(true)
  }
  const publishReason = checkPublishable(data.variants)
  const score = completeness(data)

  // Leaving the page (reload, close, external link) with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function openTab(id: TabId, focus = false) {
    setTab(id)
    setVisited((v) => (v.has(id) ? v : new Set(v).add(id)))
    if (focus) tabRefs.current[id]?.focus()
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = TABS.findIndex((t) => t.id === tab)
    const to = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (to < 0) return
    e.preventDefault()
    openTab(TABS[to].id, true)
  }

  /** Continue from the DB state (after a save, publish or translation). */
  function applyFresh(f: EditorProduct) {
    setData(f.input)
    setLabels(f.labels)
    setStatus(f.status)
    setBase(baselineFromEditor(f))
    setVersion((n) => n + 1)
    setDirty(false)
  }

  /** Saves; on failure shows `failText` (or the server's stale-data message), opens the first tab with an error and returns false. */
  async function saveNow(failText: string): Promise<boolean> {
    const r = await saveProductAction(product.id, data, labels, base)
    if (!r.ok) {
      setErrors(r.errors)
      setMsg({ kind: 'error', text: r.errors._ ?? failText })
      const first = Object.keys(r.errors).map((k) => ERROR_TAB[k]).find(Boolean)
      if (first) openTab(first)
      return false
    }
    setErrors({})
    applyFresh(r.fresh)
    return true
  }

  function save() {
    setMsg(null)
    start(async () => {
      if (await saveNow('Not saved. Fix the highlighted problems.')) setMsg({ kind: 'ok', text: 'Saved.' })
    })
  }

  function togglePublish() {
    const publish = status !== 'PUBLISHED'
    if (publish && publishReason) return setMsg({ kind: 'error', text: publishReason })
    setMsg(null)
    // Save first so what is published is what is on screen.
    start(async () => {
      if (dirty && !(await saveNow('Not saved, so not published. Fix the highlighted problems.'))) return
      const r = await publishAction(product.id, publish)
      if (!r.ok) return setMsg({ kind: 'error', text: r.error })
      if (r.fresh) applyFresh(r.fresh)
      else setStatus(publish ? 'PUBLISHED' : 'DRAFT')
      setMsg({ kind: 'ok', text: publish ? 'Published. The product is now visible in the store.' : 'Unpublished. The product is hidden from the store.' })
    })
  }

  function translate() {
    if (force && !window.confirm('Overwrite ALL uz and ru texts (including ones marked reviewed) from English?')) return
    setMsg(null)
    start(async () => {
      if (dirty && !(await saveNow('Save your changes first (there are validation errors).'))) return
      const r = await translateProductAction(product.id, force)
      if (!r.ok) return setMsg({ kind: 'error', text: `Translation failed: ${r.message}` })
      if (r.status === 'not_configured') return setMsg({ kind: 'warn', text: 'Translation not configured. Set ANTHROPIC_API_KEY in .env and restart the server.' })
      if (r.fresh) applyFresh(r.fresh)
      setMsg({ kind: 'ok', text: r.translated ? `Translated ${r.translated} strings from English into uz/ru (reviewed languages were kept).` : 'Nothing to translate: uz and ru are both marked reviewed.' })
    })
  }

  function duplicate() {
    if (dirty && !window.confirm('The copy is made from the last saved version; your unsaved changes are not included. Continue?')) return
    setMsg(null)
    start(async () => {
      const r = await duplicateProductAction(product.id)
      if (!r.ok) return setMsg({ kind: 'error', text: r.error })
      setDirty(false) // the warning was answered above
      router.push(`/admin/products/${r.id}?notice=${encodeURIComponent('This is a copy (draft, stock 0). Review it before publishing.')}`)
    })
  }

  const storefront = status === 'PUBLISHED' ? `/uz/p/${data.slug}` : null
  const tabHasError = (id: TabId) => Object.keys(errors).some((k) => ERROR_TAB[k] === id)
  const setSeo = (field: 'seoTitle' | 'seoDescription', l: string, v: string) => patch({ [field]: { ...data[field], [l]: v } })
  const seoEmpty = locales.some((l) => !data.seoTitle[l]?.trim() || !data.seoDescription[l]?.trim())

  /** Auto SEO: generated texts go into the form; staff review and save as usual. */
  function generateSeo(onlyEmpty: boolean) {
    if (!onlyEmpty && !window.confirm('Replace all SEO titles and descriptions with generated ones?')) return
    setMsg(null)
    start(async () => {
      const { title, shortSpec, descriptionHtml, brandId, categoryId, seoTitle, seoDescription } = data
      const r = await suggestSeoAction({ title, shortSpec, descriptionHtml, brandId, categoryId, seoTitle, seoDescription }, onlyEmpty)
      patch({ seoTitle: r.seoTitle, seoDescription: r.seoDescription })
      setMsg({ kind: 'info', text: 'SEO texts generated. Check them, then Save.' })
    })
  }

  const panels: Record<TabId, ReactNode> = {
    general: (
      <>
        <Section id="tr" title="Translation">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={btnGhost} disabled={pending} onClick={translate}>
              <Languages size={16} aria-hidden /> Translate from EN
            </button>
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> also overwrite reviewed languages
            </label>
          </div>
          <p className="text-xs text-neutral-500">Machine translation overwrites uz/ru text with a fresh translation of the English text. Languages marked Reviewed are skipped.</p>
          <div className="flex flex-wrap gap-6">
            {(['uz', 'ru'] as const).map((l) => (
              <label key={l} className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={data.reviewed[l]} onChange={(e) => patch({ reviewed: { ...data.reviewed, [l]: e.target.checked } })} />
                Reviewed: {l.toUpperCase()}
              </label>
            ))}
          </div>
        </Section>

        <Section id="basic" title="Basics">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <Label hint="a-z, 0-9, dashes">Slug</Label>
              <input className={`${input} font-mono text-xs`} value={data.slug} onChange={(e) => patch({ slug: e.target.value })} aria-invalid={Boolean(errors.slug)} />
              {errors.slug ? <p role="alert" className="mt-1 text-sm text-red-700">{errors.slug}</p> : null}
            </label>
            <label>
              <Label>Category</Label>
              <select className={input} value={data.categoryId} onChange={(e) => patch({ categoryId: Number(e.target.value) })}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              {errors.categoryId ? <p role="alert" className="mt-1 text-sm text-red-700">{errors.categoryId}</p> : null}
            </label>
            <label>
              <Label>Page template</Label>
              <select className={input} value={data.templateOverride ?? ''} onChange={(e) => patch({ templateOverride: (e.target.value || null) as ProductInput['templateOverride'] })}>
                <option value="">Inherit from category</option>
                <option value="SIMPLE">SIMPLE</option>
                <option value="DETAILED">DETAILED</option>
              </select>
              {errors.templateOverride ? <p role="alert" className="mt-1 text-sm text-red-700">{errors.templateOverride}</p> : null}
            </label>
            <label>
              <Label hint="manage under Brands">Brand</Label>
              <select className={input} value={data.brandId ?? ''} onChange={(e) => patch({ brandId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">No brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
              {errors.brandId ? <p role="alert" className="mt-1 text-sm text-red-700">{errors.brandId}</p> : null}
            </label>
            <label>
              <Label hint="optional, e.g. New">Badge</Label>
              <input className={input} value={data.badge ?? ''} onChange={(e) => patch({ badge: e.target.value })} />
            </label>
          </div>
        </Section>

        <Section id="text" title="Text">
          <L10nField label="Title" value={data.title} onChange={(title) => patch({ title })} />
          <L10nField label="Subtitle" value={data.subtitle} onChange={(subtitle) => patch({ subtitle })} />
          <L10nField label="Short spec line" hint="shown on cards" value={data.shortSpec} onChange={(shortSpec) => patch({ shortSpec })} />
        </Section>
      </>
    ),
    content: (
      <>
        <Section id="desc" title="Description">
          <L10nRichField key={`${product.id}-${version}`} label="Description" value={data.descriptionHtml} onChange={(descriptionHtml) => patch({ descriptionHtml })} />
          <p className="text-xs text-neutral-500">Sanitized on save. On the detailed page template the description is shown only when there are no feature sections.</p>
        </Section>
        <Section id="hl" title="Highlights">
          <HighlightsEditor items={data.highlights} onChange={(highlights) => patch({ highlights })} />
        </Section>
        <Section id="sec" title="Feature sections">
          <SectionsEditor items={data.sections} onChange={(sections) => patch({ sections })} />
        </Section>
        <Section id="box" title="In the box">
          <InTheBoxEditor items={data.inTheBox} onChange={(inTheBox) => patch({ inTheBox })} />
        </Section>
        <Section id="faq" title="FAQ">
          <FaqEditor items={data.faq} onChange={(faq) => patch({ faq })} />
        </Section>
      </>
    ),
    variants: (
      <Section id="var" title="Variants, prices and stock" error={errors.variants}>
        <VariantEditor variants={data.variants} images={data.images} imageCount={data.images.length} onChange={(variants) => patch({ variants })} />
      </Section>
    ),
    images: (
      <>
      <Section id="img" title="Images" error={errors.images}>
        <ImagesEditor
          images={data.images}
          onChange={(images) => {
            // Variants point at pictures by index: keep each variant on the same picture when images move or go away.
            setData((d) => ({ ...d, images, variants: d.variants.map((v) => ({ ...v, imageIndex: remapImageIndex(d.images, images, v.imageIndex) })) }))
            setDirty(true)
          }}
        />
      </Section>
      <Section id="img-tr" title="Translated images (uz, ru)">
        <ImageTranslationsPanel productId={product.id} dirty={dirty} />
      </Section>
      </>
    ),
    specs: (
      <Section id="spec" title="Specifications" error={errors.specs}>
        <SpecEditor
          groups={data.specs}
          labels={labels}
          onChange={(specs) => patch({ specs })}
          onLabels={(l) => {
            setLabels(l)
            setDirty(true)
          }}
        />
      </Section>
    ),
    seo: (
      <Section id="seo-h" title="Search engines (SEO)" error={errors.seo}>
        <p className="text-sm text-neutral-600">
          Shown by search engines and link previews. Keep titles within {SEO_TITLE_MAX} and descriptions within {SEO_DESCRIPTION_MAX} characters. Blank ones are generated automatically when you publish.
        </p>
        <div className="flex flex-wrap gap-2">
          {seoEmpty ? (
            <button type="button" className={btn} disabled={pending} onClick={() => generateSeo(true)}>
              <Sparkles size={16} aria-hidden /> Auto SEO: fill blank fields
            </button>
          ) : null}
          <button type="button" className={btnGhost} disabled={pending} onClick={() => generateSeo(false)}>
            <Sparkles size={16} aria-hidden /> {seoEmpty ? 'Regenerate all' : 'Auto SEO: regenerate all'}
          </button>
        </div>
        {locales.map((l) => (
          <fieldset key={l} className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50/60 p-3 sm:p-4">
            <legend className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-700">{l}</legend>
            <SeoInput label="SEO title" value={data.seoTitle[l] ?? ''} max={SEO_TITLE_MAX} placeholder={data.title[l] ?? ''} onChange={(v) => setSeo('seoTitle', l, v)} />
            <SeoInput label="SEO description" multiline value={data.seoDescription[l] ?? ''} max={SEO_DESCRIPTION_MAX} onChange={(v) => setSeo('seoDescription', l, v)} />
          </fieldset>
        ))}
      </Section>
    ),
    promotions: (
      <Section id="promo-h" title="Promotions affecting this product">
        {promotions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-600">No active or upcoming promotion applies to this product.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {promotions.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Badge tone={p.state === 'active' ? 'green' : 'blue'}>{p.state}</Badge>
                <Link href={`/admin/promotions/${p.id}`} className="font-semibold text-neutral-900 underline-offset-2 hover:text-indigo-700 hover:underline">
                  {p.name}
                </Link>
                <span className="text-neutral-700">{p.kind === 'PERCENT' ? `-${p.value}%` : `-${p.value.toLocaleString('en')} so'm`}</span>
                <span className="text-neutral-500">via {PROMO_VIA[p.via]}</span>
                <span className="ml-auto text-xs text-neutral-500">
                  {p.startsAt ? `from ${p.startsAt.replace('T', ' ')}` : 'no start'} · {p.endsAt ? `until ${p.endsAt.replace('T', ' ')}` : 'no end'} (Tashkent)
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-neutral-500">Read-only. Only the single best promotion applies to a price. Manage promotions under Promotions.</p>
      </Section>
    ),
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status === 'PUBLISHED' ? 'green' : 'amber'}>{status}</Badge>
        {product.isDemo ? <Badge tone="blue">Demo</Badge> : null}
        {dirty ? <Badge tone="amber">Unsaved changes</Badge> : null}
        {storefront ? (
          <Link href={storefront} target="_blank" className="inline-flex items-center gap-1 text-sm font-medium text-neutral-600 underline-offset-2 hover:text-indigo-700 hover:underline">
            View in store <ExternalLink size={14} aria-hidden />
          </Link>
        ) : null}
        {product.sourceUrl ? (
          <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-neutral-600 underline-offset-2 hover:text-indigo-700 hover:underline">
            Anker page
          </a>
        ) : null}
      </div>

      {product.isDemo ? <Notice kind="info">This is a demo product (sample data). Do not publish it for real customers.</Notice> : null}
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      {/* The publish gate is shown once: skip this notice while the same reason is already the current message. */}
      {publishReason && msg?.text !== publishReason ? <Notice kind="warn">{status === 'PUBLISHED' ? 'This product is live, so it cannot be saved like this' : 'Cannot publish yet'}: {publishReason}</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start">
        <div className="min-w-0 space-y-4">
          <div role="tablist" aria-label="Product sections" className="flex gap-1 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el
                }}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => openTab(t.id)}
                onKeyDown={onTabKey}
                className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  tab === t.id ? 'bg-white text-indigo-700 shadow-xs ring-1 ring-neutral-200' : 'text-neutral-600 hover:bg-white/70 hover:text-neutral-900'
                }`}
              >
                {t.label}
                {tabHasError(t.id) ? (
                  <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-red-500 align-middle" aria-label="has errors" />
                ) : t.id === 'promotions' && promotions.length ? (
                  <span className={`ml-1.5 rounded-full px-1.5 text-xs tabular-nums ${tab === t.id ? 'bg-indigo-50 text-indigo-700' : 'bg-neutral-200/70 text-neutral-700'}`}>{promotions.length}</span>
                ) : null}
              </button>
            ))}
          </div>
          {TABS.map((t) =>
            visited.has(t.id) ? (
              <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={tab !== t.id} className="space-y-4">
                {panels[t.id]}
              </div>
            ) : null,
          )}
        </div>

        <aside aria-labelledby="completeness-h" className={`${card} lg:sticky lg:top-4`}>
          <h2 id="completeness-h" className="flex items-baseline justify-between text-sm font-semibold text-neutral-900">
            Completeness <span className="tabular-nums">{score.score}%</span>
          </h2>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
            <div className={`h-full ${score.score >= 100 ? 'bg-green-500' : score.score >= 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${score.score}%` }} />
          </div>
          <ul className="mt-3 space-y-1.5 text-xs">
            {COMPLETENESS_CHECKS.map((c) => {
              const ok = !score.missing.includes(c)
              return (
                <li key={c} className={`flex items-start gap-1.5 ${ok ? 'text-neutral-600' : 'text-neutral-900'}`}>
                  {ok ? <Check size={14} className="mt-px shrink-0 text-green-600" aria-hidden /> : <X size={14} className="mt-px shrink-0 text-red-500" aria-hidden />}
                  <span>
                    <span className="sr-only">{ok ? 'Done: ' : 'Missing: '}</span>
                    {c}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-xs text-neutral-500">Updates as you edit; saved values count in the product list.</p>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_-6px_rgb(0_0_0/0.08)] backdrop-blur sm:px-6 md:left-60 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-2">
          <span className="mr-auto hidden items-center gap-2 text-sm text-neutral-600 sm:inline-flex" aria-live="polite">
            <span aria-hidden className={`size-2 rounded-full ${pending ? 'animate-pulse bg-indigo-500' : dirty ? 'bg-amber-500' : 'bg-green-500'}`} />
            {pending ? 'Working...' : dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <button type="button" className={btnGhost} onClick={duplicate} disabled={pending}>
            <Copy size={16} aria-hidden /> Duplicate
          </button>
          <a
            href={`/admin/products/${product.id}/preview`}
            target="_blank"
            rel="noopener"
            className={btnGhost}
            title={dirty ? 'The preview shows the last saved version. Save first to preview your changes.' : undefined}
          >
            <Eye size={16} aria-hidden /> Preview
          </a>
          <button type="button" className={btnGhost} onClick={togglePublish} disabled={pending}>
            {status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
          </button>
          <button type="button" className={btn} onClick={() => save()} disabled={pending}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
