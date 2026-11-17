'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deletePostAction, savePostAction, translatePostAction } from '@/app/admin/actions/blog'
import type { BlogPostInput } from '@/lib/admin/blog'
import L10nField from './L10nField'
import L10nRichField from './L10nRichField'
import { btn, btnDanger, btnGhost, btnSm, card, input, Label, Notice } from './ui'

const EMPTY: BlogPostInput = {
  slug: '',
  status: 'DRAFT',
  publishedAt: null,
  title: {},
  excerpt: {},
  contentHtml: {},
  seoTitle: {},
  seoDescription: {},
  coverImage: null,
  tags: [],
  reviewed: { uz: false, ru: false },
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

type Msg = { kind: 'ok' | 'error' | 'warn'; text: string }

export default function BlogEditor({ postId, initial }: { postId: number | null; initial: BlogPostInput | null }) {
  const router = useRouter()
  const [data, setData] = useState<BlogPostInput>(initial ?? EMPTY)
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(', '))
  const [slugTouched, setSlugTouched] = useState(initial !== null)
  const [version, setVersion] = useState(0) // remounts the uncontrolled rich editors after a machine translation
  const [msg, setMsg] = useState<Msg | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pending, start] = useTransition()
  const patch = (p: Partial<BlogPostInput>) => setData((d) => ({ ...d, ...p }))

  const payload = (): BlogPostInput => ({
    ...data,
    publishedAt: data.publishedAt || null,
    tags: tagsText.split(',').map((x) => x.trim()).filter(Boolean),
  })

  function save(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    start(async () => {
      const r = await savePostAction(postId, payload())
      if (!r.ok) return setMsg({ kind: 'error', text: r.error })
      if (postId === null) return router.replace(`/admin/blog/${r.id}`)
      setMsg({ kind: 'ok', text: 'Saved.' })
      router.refresh()
    })
  }

  function remove() {
    if (postId === null || !confirm('Delete this post? This cannot be undone.')) return
    start(async () => {
      const r = await deletePostAction(postId)
      if (!r.ok) return setMsg({ kind: 'error', text: r.error })
      router.push('/admin/blog')
      router.refresh()
    })
  }

  function translate(force: boolean) {
    if (postId === null) return
    if (force && !window.confirm('Overwrite ALL uz and ru texts (including ones marked reviewed) from English?')) return
    setMsg(null)
    start(async () => {
      const saved = await savePostAction(postId, payload())
      if (!saved.ok) return setMsg({ kind: 'error', text: `Save the post first: ${saved.error}` })
      const r = await translatePostAction(postId, force)
      if (!r.ok) return setMsg({ kind: 'error', text: `Translation failed: ${r.message}` })
      if (r.status === 'not_configured') return setMsg({ kind: 'warn', text: 'Translation not configured. Set ANTHROPIC_API_KEY in .env and restart the server.' })
      if (r.fresh) {
        setData(r.fresh)
        setVersion((v) => v + 1)
      }
      setMsg({
        kind: 'ok',
        text: r.translated ? `Translated ${r.translated} strings from English into uz/ru (reviewed languages were kept).` : 'Nothing to translate: uz and ru are both marked reviewed.',
      })
    })
  }

  async function uploadCover(file: File) {
    setMsg(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('upload', file)
      const res = await fetch('/api/admin/uploads', { method: 'POST', body: fd })
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } }
      if (!res.ok || !body.url) return setMsg({ kind: 'error', text: body.error?.message ?? 'Upload failed.' })
      patch({ coverImage: body.url })
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}

      <section className={`${card} grid gap-4 sm:grid-cols-2`} aria-label="Post">
        <div className="sm:col-span-2">
          <L10nField
            label="Title"
            value={data.title}
            onChange={(title) => {
              patch({ title, ...(slugTouched ? {} : { slug: slugify(title.en ?? '') }) })
            }}
          />
        </div>
        <label>
          <Label hint="a-z, 0-9, dashes">Slug</Label>
          <input
            className={input}
            value={data.slug}
            minLength={3}
            maxLength={80}
            required
            pattern="[a-z0-9\-]{3,80}"
            onChange={(e) => {
              setSlugTouched(true)
              patch({ slug: e.target.value })
            }}
          />
        </label>
        <label>
          <Label hint="comma separated, up to 10">Tags</Label>
          <input className={input} value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="chargers, audio" />
        </label>
        <label>
          <Label>Status</Label>
          <select className={input} value={data.status} onChange={(e) => patch({ status: e.target.value as BlogPostInput['status'] })}>
            <option value="DRAFT">Draft (hidden)</option>
            <option value="PUBLISHED">Published</option>
          </select>
        </label>
        <label>
          <Label hint="Tashkent time; a future date schedules the post">Publish date</Label>
          <input className={input} type="datetime-local" value={data.publishedAt ?? ''} onChange={(e) => patch({ publishedAt: e.target.value || null })} />
        </label>
      </section>

      <section className={card} aria-label="Cover image">
        <Label hint="jpg, png, webp or gif, up to 5 MB">Cover image</Label>
        <div className="flex flex-wrap items-center gap-4">
          {data.coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.coverImage} alt="Cover preview" className="h-24 w-40 rounded-lg border border-neutral-200 object-cover" />
          ) : (
            <div className="flex h-24 w-40 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-xs text-neutral-400">No cover</div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className={`${btnGhost} ${btnSm} cursor-pointer`}>
              {uploading ? 'Uploading...' : data.coverImage ? 'Replace' : 'Upload'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void uploadCover(f)
                }}
              />
            </label>
            {data.coverImage ? (
              <button type="button" className={`${btnGhost} ${btnSm}`} onClick={() => patch({ coverImage: null })}>
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className={`${card} space-y-4`} aria-label="Content" key={`content-${version}`}>
        <L10nField label="Excerpt" value={data.excerpt} onChange={(excerpt) => patch({ excerpt })} multiline rows={3} hint="shown on cards; falls back to the start of the text" />
        <L10nRichField label="Content" value={data.contentHtml} onChange={(contentHtml) => patch({ contentHtml })} />
      </section>

      <section className={`${card} space-y-4`} aria-label="SEO" key={`seo-${version}`}>
        <L10nField label="SEO title" value={data.seoTitle} onChange={(seoTitle) => patch({ seoTitle })} hint="optional, defaults to the title" />
        <L10nField label="SEO description" value={data.seoDescription} onChange={(seoDescription) => patch({ seoDescription })} multiline rows={3} hint="optional, defaults to the excerpt" />
      </section>

      <section className={`${card} space-y-3`} aria-label="Translation">
        <Label hint="English is the source">Translation</Label>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {(['uz', 'ru'] as const).map((l) => (
            <label key={l} className="flex items-center gap-2">
              <input type="checkbox" checked={data.reviewed[l]} onChange={(e) => patch({ reviewed: { ...data.reviewed, [l]: e.target.checked } })} />
              {l.toUpperCase()} reviewed (machine translation will not overwrite it)
            </label>
          ))}
        </div>
        {postId !== null ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnGhost} disabled={pending} onClick={() => translate(false)}>
              Translate from EN
            </button>
            <button type="button" className={btnGhost} disabled={pending} onClick={() => translate(true)}>
              Retranslate all (overwrite reviewed)
            </button>
          </div>
        ) : (
          <p className="text-xs text-neutral-500">Save the post once to enable machine translation.</p>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {postId !== null ? (
          <button type="button" className={`${btnDanger} mr-auto`} onClick={remove} disabled={pending}>
            Delete
          </button>
        ) : null}
        {postId !== null && data.status === 'PUBLISHED' ? (
          <a href={`/uz/blog/${data.slug}`} target="_blank" rel="noreferrer" className={btnGhost}>
            View on site
          </a>
        ) : null}
        <button type="button" className={btnGhost} onClick={() => router.push('/admin/blog')} disabled={pending}>
          Cancel
        </button>
        <button type="submit" className={btn} disabled={pending || uploading}>
          {pending ? 'Saving...' : 'Save post'}
        </button>
      </div>
    </form>
  )
}
