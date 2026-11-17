'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveSpecLabelsAction, saveUiAction, translateUiMissingAction } from '@/app/admin/actions'
import type { UiRow, SpecLabelRow } from '@/lib/admin/translations'
import type { L10n } from '@/lib/localized'
import { Badge, btn, btnGhost, card, input, Notice, table, td, th } from './ui'

type Msg = { kind: 'ok' | 'error' | 'warn'; text: string } | null

const sth = `${th} sticky top-0 z-10`

export default function TranslationsEditor({ rows, specRows, configured }: { rows: UiRow[]; specRows: SpecLabelRow[]; configured: boolean }) {
  const router = useRouter()
  const [ui, setUi] = useState<Record<string, L10n>>(() => Object.fromEntries(rows.map((r) => [r.key, { en: r.en, uz: r.uz, ru: r.ru }])))
  const [spec, setSpec] = useState<Record<string, L10n>>(() => Object.fromEntries(specRows.map((r) => [r.key, { en: r.label.en ?? '', uz: r.label.uz ?? '', ru: r.label.ru ?? '' }])))
  const [q, setQ] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [editEn, setEditEn] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const [pending, start] = useTransition()

  const initial = useMemo(() => Object.fromEntries(rows.map((r) => [r.key, { en: r.en, uz: r.uz, ru: r.ru }])) as Record<string, L10n>, [rows])
  const initialSpec = useMemo(() => Object.fromEntries(specRows.map((r) => [r.key, { en: r.label.en ?? '', uz: r.label.uz ?? '', ru: r.label.ru ?? '' }])) as Record<string, L10n>, [specRows])

  const changedUi = rows.filter((r) => ['en', 'uz', 'ru'].some((l) => (ui[r.key]?.[l as 'en'] ?? '') !== (initial[r.key]?.[l as 'en'] ?? '')))
  const changedSpec = specRows.filter((r) => ['en', 'uz', 'ru'].some((l) => (spec[r.key]?.[l as 'en'] ?? '') !== (initialSpec[r.key]?.[l as 'en'] ?? '')))

  const needle = q.trim().toLowerCase()
  const shown = rows.filter((r) => {
    if (onlyMissing && ui[r.key]?.uz?.trim() && ui[r.key]?.ru?.trim()) return false
    if (!needle) return true
    return r.key.toLowerCase().includes(needle) || Object.values(ui[r.key] ?? {}).some((v) => v?.toLowerCase().includes(needle))
  })
  const missingCount = rows.filter((r) => !ui[r.key]?.uz?.trim() || !ui[r.key]?.ru?.trim()).length

  function saveUi() {
    setMsg(null)
    start(async () => {
      const r = await saveUiAction(changedUi.map((row) => ({ key: row.key, values: ui[row.key] })))
      if (!r.ok) return setMsg({ kind: 'error', text: r.error })
      setMsg({ kind: 'ok', text: `Saved ${r.saved} UI strings.` })
      router.refresh()
    })
  }
  function saveSpec() {
    setMsg(null)
    start(async () => {
      const r = await saveSpecLabelsAction(changedSpec.map((row) => ({ key: row.key, label: spec[row.key] })))
      if (!r.ok) return setMsg({ kind: 'error', text: r.error })
      setMsg({ kind: 'ok', text: `Saved ${changedSpec.length} spec labels.` })
      router.refresh()
    })
  }
  function translateMissing() {
    if (changedUi.length && !window.confirm('You have unsaved edits; they stay on screen but are not saved by this action. Continue?')) return
    setMsg(null)
    start(async () => {
      const r = await translateUiMissingAction()
      if (!r.ok) return setMsg({ kind: 'error', text: `Translation failed: ${r.message}` })
      if (r.status === 'not_configured') return setMsg({ kind: 'warn', text: 'Translation not configured. Set ANTHROPIC_API_KEY in .env and restart the server.' })
      setMsg({ kind: 'ok', text: r.translated ? `Translated ${r.translated} missing strings.` : 'Nothing missing: every key has uz and ru text.' })
      router.refresh()
    })
  }

  const cell = (r: UiRow, l: 'en' | 'uz' | 'ru') => {
    const value = ui[r.key]?.[l] ?? ''
    const readOnly = l === 'en' && !editEn
    const multi = value.length > 60 || r.en.length > 60
    const props = {
      value,
      readOnly,
      'aria-label': `${r.key} ${l}`,
      onChange: (e: { target: { value: string } }) => setUi((s) => ({ ...s, [r.key]: { ...s[r.key], [l]: e.target.value } })),
      className: `${input} !py-1 ${readOnly ? '!border-transparent !bg-neutral-100 text-neutral-600' : ''} ${l !== 'en' && !value.trim() ? '!border-amber-400 !bg-amber-50' : ''}`,
    }
    return multi ? <textarea rows={Math.min(5, Math.ceil(Math.max(value.length, r.en.length) / 40))} {...props} /> : <input {...props} />
  }

  return (
    <div className="space-y-8">
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}

      <section aria-labelledby="ui-h" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="ui-h" className="text-base font-semibold text-neutral-900">
            Interface texts <span className="text-sm font-normal text-neutral-500">({rows.length} keys, {missingCount} with a missing uz/ru)</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={configured ? 'green' : 'amber'}>{configured ? 'Translation configured' : 'Translation not configured'}</Badge>
            <button type="button" className={btnGhost} disabled={pending} onClick={translateMissing}>
              Translate missing
            </button>
            <button type="button" className={btn} disabled={pending || changedUi.length === 0} onClick={saveUi}>
              Save{changedUi.length ? ` (${changedUi.length})` : ''}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-xs">
          <input className={`${input} max-w-xs !py-1.5`} placeholder="Search key or text" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search UI strings" />
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input className="size-4" type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> only missing
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input className="size-4" type="checkbox" checked={editEn} onChange={(e) => setEditEn(e.target.checked)} /> edit English too
          </label>
        </div>
        <div className={`${card} overflow-auto !p-0 md:max-h-[calc(100dvh-14rem)]`}>
          <table className={`${table} min-w-[760px]`}>
            <thead>
              <tr>
                <th className={`${sth} sm:pl-4`}>Key</th>
                <th className={sth}>EN</th>
                <th className={sth}>UZ</th>
                <th className={`${sth} sm:pr-4`}>RU</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.key} className="transition-colors hover:bg-neutral-50">
                  <th scope="row" className={`${td} !align-top font-mono text-xs font-normal text-neutral-500 sm:pl-4`}>
                    {r.key}
                  </th>
                  <td className={`${td} !align-top`}>{cell(r, 'en')}</td>
                  <td className={`${td} !align-top`}>{cell(r, 'uz')}</td>
                  <td className={`${td} !align-top sm:pr-4`}>{cell(r, 'ru')}</td>
                </tr>
              ))}
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-10 text-center text-sm text-neutral-500">
                    Nothing matches.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-neutral-500">Keep placeholders such as {'{count}'} exactly as in English; a mismatch is rejected on save.</p>
      </section>

      <section aria-labelledby="spec-h" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="spec-h" className="text-base font-semibold text-neutral-900">
            Specification dictionary <span className="text-sm font-normal text-neutral-500">({specRows.length} labels)</span>
          </h2>
          <button type="button" className={btn} disabled={pending || changedSpec.length === 0} onClick={saveSpec}>
            Save{changedSpec.length ? ` (${changedSpec.length})` : ''}
          </button>
        </div>
        <div className={`${card} overflow-auto !p-0 md:max-h-[calc(100dvh-14rem)]`}>
          <table className={`${table} min-w-[760px]`}>
            <thead>
              <tr>
                <th className={`${sth} sm:pl-4`}>Key</th>
                <th className={sth}>EN</th>
                <th className={sth}>UZ</th>
                <th className={`${sth} sm:pr-4`}>RU</th>
              </tr>
            </thead>
            <tbody>
              {specRows.map((r) => (
                <tr key={r.key} className="transition-colors hover:bg-neutral-50">
                  <th scope="row" className={`${td} font-mono text-xs font-normal text-neutral-500 sm:pl-4`}>
                    {r.key}
                  </th>
                  {(['en', 'uz', 'ru'] as const).map((l) => (
                    <td key={l} className={`${td} ${l === 'ru' ? 'sm:pr-4' : ''}`}>
                      <input
                        aria-label={`${r.key} ${l}`}
                        className={`${input} !py-1 ${l !== 'en' && !spec[r.key]?.[l]?.trim() ? '!border-amber-400 !bg-amber-50' : ''}`}
                        value={spec[r.key]?.[l] ?? ''}
                        onChange={(e) => setSpec((s) => ({ ...s, [r.key]: { ...s[r.key], [l]: e.target.value } }))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              {specRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-10 text-center text-sm text-neutral-500">
                    No spec labels yet. They appear when you import a product.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
