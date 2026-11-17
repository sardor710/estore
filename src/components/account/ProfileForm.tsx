'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Loader2, LogOut, ShieldOff, Trash2 } from 'lucide-react'
import { locales, type Locale } from '@/i18n/routing'
import { path } from '@/lib/paths'
import { updateProfileAction, deleteAccountAction } from '@/app/[locale]/account/actions'
import { formatPhone } from './format'
import { signOut } from './signOut'

const LANGUAGE_NAMES: Record<Locale, string> = { uz: 'Oʻzbekcha', ru: 'Русский', en: 'English' }

/** Case- and apostrophe-insensitive compare for the typed confirmation word (Oʻ / O' / O‘ / O`). */
const normWord = (s: string) => s.trim().replace(/[ʻʼ'‘’`]/g, "'").toLocaleUpperCase()

type SaveError = 'name' | 'INVALID' | 'NOT_FOUND' | 'AUTH' | 'network'

export default function ProfileForm({
  locale,
  profile,
  telegram = false,
}: {
  locale: Locale
  profile: { name: string; phone: string; locale: Locale | null; notifyTelegram: boolean }
  /** Inside the Telegram Mini App: no plain "Sign out" (the next open signs in again from Telegram). */
  telegram?: boolean
}) {
  const t = useTranslations('account.profile')
  const [name, setName] = useState(profile.name)
  // Starts from the language being viewed (the stored one may come from Telegram's app language), so saving other
  // fields never switches the site; picking another language does.
  const [lang, setLang] = useState<Locale>(locale)
  const [notify, setNotify] = useState(profile.notifyTelegram)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<SaveError | null>(null)
  const [signingOut, setSigningOut] = useState<'one' | 'all' | null>(null)
  const [signOutFailed, setSignOutFailed] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [word, setWord] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(false)
    const n = name.trim()
    if (n.length < 2 || n.length > 100) {
      setError('name')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const r = await updateProfileAction({ name: n, locale: lang, notifyTelegram: notify })
      if (r.ok) {
        // A new language also switches the website to it.
        if (lang !== locale) {
          window.location.assign(path(lang, '/account/profile'))
          return
        }
        setSaved(true)
      } else setError(r.error)
    } catch {
      setError('network')
    }
    setSaving(false)
  }

  const doSignOut = async (everywhere: boolean) => {
    setSigningOut(everywhere ? 'all' : 'one')
    setSignOutFailed(false)
    if (!(await signOut(locale, everywhere))) {
      setSigningOut(null)
      setSignOutFailed(true)
    }
  }

  const doDelete = async () => {
    setDeleting(true)
    setDeleteError(false)
    try {
      const r = await deleteAccountAction()
      if (r.ok || r.error === 'AUTH') {
        window.location.assign(path(locale))
        return
      }
    } catch {
      // fall through
    }
    setDeleteError(true)
    setDeleting(false)
  }

  const card = 'rounded-2xl border border-neutral-100 bg-white p-5 sm:p-6'
  const input = 'w-full rounded-xl border bg-white px-4 py-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900'
  const labelCls = 'mb-1.5 block text-sm font-semibold text-neutral-800'
  const outline = 'inline-flex items-center gap-2 rounded-full border border-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-800 hover:border-neutral-400 disabled:opacity-60'
  const confirmWord = t('deleteWord')
  const wordOk = normWord(word) === normWord(confirmWord)

  return (
    <div className="mt-8 space-y-6">
      <form onSubmit={save} noValidate className={card} aria-labelledby="pf-details">
        <h2 id="pf-details" className="text-lg font-bold text-neutral-900">
          {t('details')}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pf-name" className={labelCls}>
              {t('name')}
            </label>
            <input
              id="pf-name"
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setSaved(false)
              }}
              maxLength={100}
              aria-invalid={error === 'name' || undefined}
              aria-describedby={error === 'name' ? 'pf-name-err' : undefined}
              className={`${input} ${error === 'name' ? 'border-red-400' : 'border-neutral-200'}`}
            />
            {error === 'name' && (
              <p id="pf-name-err" className="mt-1 text-xs font-medium text-red-600" role="alert">
                {t('errors.name')}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="pf-phone" className={labelCls}>
              {t('phone')}
            </label>
            <input id="pf-phone" value={formatPhone(profile.phone)} readOnly aria-describedby="pf-phone-hint" className={`${input} border-neutral-200 bg-neutral-50 text-neutral-600`} />
            <p id="pf-phone-hint" className="mt-1 text-xs text-neutral-500">
              {t('phoneHint')}
            </p>
          </div>
          <div>
            <label htmlFor="pf-lang" className={labelCls}>
              {t('language')}
            </label>
            <select
              id="pf-lang"
              value={lang}
              onChange={(e) => {
                setLang(e.target.value as Locale)
                setSaved(false)
              }}
              aria-describedby="pf-lang-hint"
              className={`${input} border-neutral-200`}
            >
              {locales.map((l) => (
                <option key={l} value={l} lang={l}>
                  {LANGUAGE_NAMES[l]}
                </option>
              ))}
            </select>
            <p id="pf-lang-hint" className="mt-1 text-xs text-neutral-500">
              {t('languageHint')}
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-start justify-between gap-4 rounded-xl bg-neutral-50 p-4">
          <div className="min-w-0">
            <p id="pf-notify-label" className="text-sm font-semibold text-neutral-900">
              {t('notify')}
            </p>
            <p id="pf-notify-hint" className="mt-0.5 text-xs text-neutral-500">
              {t('notifyHint')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={notify}
            aria-labelledby="pf-notify-label"
            aria-describedby="pf-notify-hint"
            onClick={() => {
              setNotify((v) => !v)
              setSaved(false)
            }}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${notify ? 'bg-neutral-900' : 'bg-neutral-300'}`}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${notify ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {error && error !== 'name' && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {t(`errors.${error}`)}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-wait disabled:bg-neutral-500"
          >
            {saving && <Loader2 size={15} className="animate-spin" aria-hidden />}
            {saving ? t('saving') : t('save')}
          </button>
          <span role="status" aria-live="polite" className="text-sm font-semibold text-emerald-700">
            {saved && (
              <span className="inline-flex items-center gap-1">
                <Check size={15} aria-hidden /> {t('saved')}
              </span>
            )}
          </span>
        </div>
      </form>

      <section className={card} aria-labelledby="pf-sessions">
        <h2 id="pf-sessions" className="text-lg font-bold text-neutral-900">
          {t('sessions')}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div hidden={telegram}>
            <button type="button" onClick={() => doSignOut(false)} disabled={signingOut !== null} className={outline}>
              {signingOut === 'one' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <LogOut size={15} aria-hidden />}
              {t('signOut')}
            </button>
            <p className="mt-2 text-xs text-neutral-500">{t('signOutHint')}</p>
          </div>
          <div>
            <button type="button" onClick={() => doSignOut(true)} disabled={signingOut !== null} className={outline}>
              {signingOut === 'all' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ShieldOff size={15} aria-hidden />}
              {t('signOutAll')}
            </button>
            <p className="mt-2 text-xs text-neutral-500">{t('signOutAllHint')}</p>
          </div>
        </div>
        {signOutFailed && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {t('errors.network')}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-red-100 bg-white p-5 sm:p-6" aria-labelledby="pf-delete">
        <h2 id="pf-delete" className="text-lg font-bold text-red-700">
          {t('deleteTitle')}
        </h2>
        <p className="mt-2 text-sm text-neutral-600">{t('deleteText')}</p>
        {!deleteOpen ? (
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            <Trash2 size={15} aria-hidden /> {t('deleteButton')}
          </button>
        ) : (
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (wordOk && !deleting) void doDelete()
            }}
          >
            <label htmlFor="pf-delete-word" className={labelCls}>
              {t('deletePrompt', { word: confirmWord })}
            </label>
            <input
              id="pf-delete-word"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              className={`${input} max-w-xs border-neutral-200`}
            />
            {deleteError && (
              <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {t('errors.network')}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={!wordOk || deleting}
                className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                {deleting ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Trash2 size={15} aria-hidden />}
                {deleting ? t('deleting') : t('deleteButton')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteOpen(false)
                  setWord('')
                }}
                className="rounded-full border border-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-800 hover:border-neutral-400"
              >
                {t('cancel')}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
