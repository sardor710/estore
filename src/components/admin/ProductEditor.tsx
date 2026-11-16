'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ExternalLink, Languages } from 'lucide-react'
import { publishAction, saveProductAction, translateProductAction } from '@/app/admin/actions'
import type { ProductInput } from '@/lib/admin/products-shared'
import { baselineFromEditor, checkPublishable, type EditBaseline } from '@/lib/admin/products-shared'
import type { EditorProduct } from '@/lib/admin/product-view'
import type { L10n } from '@/lib/localized'
import { Badge, btn, btnGhost, card, input, Label, Notice } from './ui'
import L10nField from './L10nField'
import VariantEditor from './VariantEditor'
import SpecEditor from './SpecEditor'
import ImagesEditor from './ImagesEditor'
import { FaqEditor, HighlightsEditor, InTheBoxEditor, SectionsEditor } from './ContentEditor'

type Category = { id: number; label: string }
type Msg = { kind: 'ok' | 'error' | 'warn' | 'info'; text: string } | null

function Section({ title, children, error, id }: { title: string; children: React.ReactNode; error?: string; id: string }) {
  return (
    <section className={card} aria-labelledby={id}>
      <h2 id={id} className="mb-3 text-base font-bold text-neutral-900">
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

export default function ProductEditor({ product, categories, initialNotice }: { product: EditorProduct; categories: Category[]; initialNotice?: string }) {
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

  const patch = (p: Partial<ProductInput>) => {
    setData((d) => ({ ...d, ...p }))
    setDirty(true)
  }
  const publishReason = checkPublishable(data.variants)

  /** Continue from the DB state (after a save, publish or translation). */
  function applyFresh(f: EditorProduct) {
    setData(f.input)
    setLabels(f.labels)
    setStatus(f.status)
    setBase(baselineFromEditor(f))
    setDirty(false)
  }

  /** Saves; on failure shows `failText` (or the server's stale-data message) and returns false. */
  async function saveNow(failText: string): Promise<boolean> {
    const r = await saveProductAction(product.id, data, labels, base)
    if (!r.ok) {
      setErrors(r.errors)
      setMsg({ kind: 'error', text: r.errors._ ?? failText })
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

  const storefront = status === 'PUBLISHED' ? `/uz/p/${data.slug}` : null

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status === 'PUBLISHED' ? 'green' : 'amber'}>{status}</Badge>
        {product.isDemo ? <Badge tone="blue">Demo</Badge> : null}
        {dirty ? <Badge tone="neutral">Unsaved changes</Badge> : null}
        {storefront ? (
          <Link href={storefront} target="_blank" className="inline-flex items-center gap-1 text-sm text-neutral-600 underline">
            View in store <ExternalLink size={14} aria-hidden />
          </Link>
        ) : null}
        {product.sourceUrl ? (
          <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-neutral-500 underline">
            Anker page
          </a>
        ) : null}
      </div>

      {product.isDemo ? <Notice kind="info">This is a demo product (sample data). Do not publish it for real customers.</Notice> : null}
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      {/* The publish gate is shown once: skip this notice while the same reason is already the current message. */}
      {publishReason && msg?.text !== publishReason ? <Notice kind="warn">{status === 'PUBLISHED' ? 'This product is live, so it cannot be saved like this' : 'Cannot publish yet'}: {publishReason}</Notice> : null}

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
              <input
                type="checkbox"
                checked={data.reviewed[l]}
                onChange={(e) => patch({ reviewed: { ...data.reviewed, [l]: e.target.checked } })}
              />
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
          </label>
          <label>
            <Label>Brand</Label>
            <input className={input} value={data.brand} onChange={(e) => patch({ brand: e.target.value })} />
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
        <L10nField label="Description (HTML)" hint="sanitized on save" multiline rows={10} mono value={data.descriptionHtml} onChange={(descriptionHtml) => patch({ descriptionHtml })} />
      </Section>

      <Section id="img" title="Images" error={errors.images}>
        <ImagesEditor images={data.images} onChange={(images) => patch({ images })} />
      </Section>

      <Section id="var" title="Variants, prices and stock" error={errors.variants}>
        <VariantEditor variants={data.variants} images={data.images} imageCount={data.images.length} onChange={(variants) => patch({ variants })} />
      </Section>

      <Section id="spec" title="Specifications" error={errors.specs}>
        <SpecEditor groups={data.specs} labels={labels} onChange={(specs) => patch({ specs })} onLabels={(l) => { setLabels(l); setDirty(true) }} />
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

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur md:left-56">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-2">
          <span className="mr-auto hidden text-sm text-neutral-500 sm:block" aria-live="polite">{pending ? 'Working...' : dirty ? 'Unsaved changes' : 'All changes saved'}</span>
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
