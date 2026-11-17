'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ExternalLink, Loader2, RotateCcw, Send } from 'lucide-react'
import { normalizeUzPhone } from '@/lib/phone'

type Tab = 'telegram' | 'code'
type Started = { checkCode: string; deepLink: string; qrSvg: string; expiresAt: string }
type TgState =
  | { s: 'idle' }
  | { s: 'starting' }
  | ({ s: 'waiting' } & Started)
  | { s: 'done' }
  | { s: 'expired' }
  | { s: 'error'; message: 'unavailable' | 'rateLimited' | 'error' }

const POLL_MS = 2000
const RESEND_SECONDS = 60

/** Full navigation (not router.push) so the server-rendered header and favorites pick up the new session. */
const go = (next: string) => window.location.assign(next)

export default function LoginPanel({ next }: { next: string }) {
  const t = useTranslations('account.login')
  const [tab, setTab] = useState<Tab>('telegram')
  const tabs: Tab[] = ['telegram', 'code']
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ telegram: null, code: null })

  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const i = tabs.indexOf(tab)
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    setTab(tabs[n])
    tabRefs.current[tabs[n]]?.focus()
  }

  return (
    <div className="mt-8 rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm sm:p-8">
      <div role="tablist" aria-label={t('tabsLabel')} className="grid grid-cols-2 gap-1 rounded-full bg-neutral-100 p-1" onKeyDown={onTabKey}>
        {tabs.map((k) => (
          <button
            key={k}
            ref={(el) => {
              tabRefs.current[k] = el
            }}
            id={`login-tab-${k}`}
            type="button"
            role="tab"
            aria-selected={tab === k}
            aria-controls={`login-panel-${k}`}
            tabIndex={tab === k ? 0 : -1}
            onClick={() => setTab(k)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === k ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            {k === 'telegram' ? t('tabTelegram') : t('tabCode')}
          </button>
        ))}
      </div>

      <div id="login-panel-telegram" role="tabpanel" aria-labelledby="login-tab-telegram" hidden={tab !== 'telegram'} className="mt-6">
        <TelegramSignIn next={next} active={tab === 'telegram'} />
      </div>
      <div id="login-panel-code" role="tabpanel" aria-labelledby="login-tab-code" hidden={tab !== 'code'} className="mt-6">
        <CodeSignIn next={next} />
      </div>
    </div>
  )
}

function TelegramSignIn({ next, active }: { next: string; active: boolean }) {
  const t = useTranslations('account.login')
  const [state, setState] = useState<TgState>({ s: 'idle' })

  const start = useCallback(async () => {
    setState({ s: 'starting' })
    try {
      const res = await fetch('/api/account/login/start', { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as Partial<Started> & { error?: string }
      if (res.ok && data.checkCode && data.deepLink && data.qrSvg && data.expiresAt) {
        setState({ s: 'waiting', checkCode: data.checkCode, deepLink: data.deepLink, qrSvg: data.qrSvg, expiresAt: data.expiresAt })
        return
      }
      if (res.status === 503 || data.error === 'BOT_NOT_CONFIGURED') setState({ s: 'error', message: 'unavailable' })
      else if (res.status === 429) setState({ s: 'error', message: 'rateLimited' })
      else setState({ s: 'error', message: 'error' })
    } catch {
      setState({ s: 'error', message: 'error' })
    }
  }, [])

  // Poll every 2 s while waiting (and the tab is shown) until the request expires.
  const waiting = state.s === 'waiting' ? state : null
  useEffect(() => {
    if (!waiting || !active) return
    const expiresAt = Date.parse(waiting.expiresAt)
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      if (stopped) return
      if (Date.now() >= expiresAt) {
        setState({ s: 'expired' })
        return
      }
      try {
        const res = await fetch('/api/account/login/status', { cache: 'no-store' })
        const data = (await res.json().catch(() => ({}))) as { state?: string }
        if (stopped) return
        if (data.state === 'done') {
          setState({ s: 'done' })
          go(next)
          return
        }
        // 'denied' (this browser does not hold the request) is shown like an expired request.
        if (data.state === 'expired' || data.state === 'denied') {
          setState({ s: 'expired' })
          return
        }
      } catch {
        // offline for a moment: keep polling until the request expires
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS)
    }
    timer = setTimeout(tick, POLL_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [waiting, active, next])

  if (state.s === 'idle' || state.s === 'starting') {
    return (
      <div className="text-center">
        <p className="text-sm text-neutral-600">{t('telegramIntro')}</p>
        <button
          type="button"
          onClick={start}
          disabled={state.s === 'starting'}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-wait disabled:bg-neutral-500"
        >
          {state.s === 'starting' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Send size={16} aria-hidden />}
          {state.s === 'starting' ? t('starting') : t('start')}
        </button>
      </div>
    )
  }

  if (state.s === 'error') {
    return (
      <div className="text-center">
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
          {t(state.message)}
        </p>
        {state.message !== 'unavailable' && (
          <button type="button" onClick={start} className="mt-4 inline-flex items-center gap-2 rounded-full border border-neutral-200 px-5 py-2.5 text-sm font-semibold text-neutral-800 hover:border-neutral-400">
            <RotateCcw size={15} aria-hidden /> {t('tryAgain')}
          </button>
        )}
      </div>
    )
  }

  if (state.s === 'expired') {
    return (
      <div className="text-center">
        <p className="text-sm text-neutral-700" role="status">
          {t('expired')}
        </p>
        <button
          type="button"
          onClick={start}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white hover:bg-black"
        >
          <RotateCcw size={15} aria-hidden /> {t('tryAgain')}
        </button>
      </div>
    )
  }

  if (state.s === 'done') {
    return (
      <p className="text-center text-sm font-semibold text-emerald-700" role="status">
        {t('done')}
      </p>
    )
  }

  return (
    <div className="text-center">
      <p className="text-sm font-semibold text-neutral-800">{t('tapCode')}</p>
      <p
        className="mt-3 font-[family-name:var(--font-heading)] text-6xl font-extrabold tabular-nums tracking-[0.2em] text-neutral-900 sm:text-7xl"
        aria-label={`${t('codeLabel')}: ${state.checkCode.split('').join(' ')}`}
      >
        {state.checkCode}
      </p>
      <ol className="mx-auto mt-5 max-w-sm list-decimal space-y-1 pl-5 text-left text-sm text-neutral-600">
        <li>{t('step1')}</li>
        <li>{t('step2')}</li>
        <li>{t('step3')}</li>
      </ol>
      <a
        href={state.deepLink}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#229ED9] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#1c8cc2]"
      >
        <Send size={16} aria-hidden /> {t('openTelegram')}
        <ExternalLink size={14} aria-hidden className="opacity-70" />
      </a>
      <div className="mt-6 hidden flex-col items-center md:flex">
        {/* qrSvg is rendered server-side by our own /api/account/login/start (qrcode library, from our deep link
            only) — never user-supplied markup, so injecting it is safe here. */}
        <div className="h-44 w-44 rounded-xl border border-neutral-100 bg-white p-2 [&>svg]:h-full [&>svg]:w-full" aria-hidden dangerouslySetInnerHTML={{ __html: state.qrSvg }} />
        <p className="mt-2 text-xs text-neutral-500">{t('qrHint')}</p>
      </div>
      <p className="mt-6 flex items-center justify-center gap-2 text-sm text-neutral-600" role="status" aria-live="polite">
        <Loader2 size={15} className="animate-spin text-neutral-400" aria-hidden />
        {t('waiting')}
      </p>
      <p className="mt-4 rounded-xl bg-neutral-50 px-4 py-3 text-xs text-neutral-600">{t('warning')}</p>
    </div>
  )
}

type CodeError = 'phone' | 'codeFormat' | 'invalid' | 'expired' | 'too_many_attempts' | 'telegram' | 'rateLimited' | 'network'

function CodeSignIn({ next }: { next: string }) {
  const t = useTranslations('account.login')
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<CodeError | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus()
  }, [step])

  const request = async () => {
    const normalized = normalizeUzPhone(phone)
    if (!normalized) {
      setError('phone')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/account/login/code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: normalized }),
      })
      if (res.ok) {
        setStep('code')
        setCode('')
        setCooldown(RESEND_SECONDS)
      } else if (res.status === 400) setError('phone')
      else if (res.status === 429) setError('rateLimited')
      else if (res.status === 502) setError('telegram')
      else setError('network')
    } catch {
      setError('network')
    }
    setBusy(false)
  }

  const verify = async () => {
    const c = code.replace(/\D/g, '')
    if (c.length !== 6) {
      setError('codeFormat')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/account/login/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: normalizeUzPhone(phone), code: c }),
      })
      if (res.ok) {
        go(next)
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (res.status === 429) setError('rateLimited')
      else if (data.error === 'expired' || data.error === 'too_many_attempts') setError(data.error)
      else if (res.status === 400) setError('invalid')
      else setError('network')
    } catch {
      setError('network')
    }
    setBusy(false)
  }

  const input =
    'w-full rounded-xl border bg-white px-4 py-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900'
  const errorText = error ? t(`errors.${error}`) : null
  const primary =
    'inline-flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-wait disabled:bg-neutral-500'

  if (step === 'phone') {
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void request()
        }}
      >
        <p className="text-sm text-neutral-600">{t('codeIntro')}</p>
        <label htmlFor="login-phone" className="mb-1.5 mt-5 block text-sm font-semibold text-neutral-800">
          {t('phone')}
        </label>
        <input
          id="login-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={t('phonePlaceholder')}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-invalid={error === 'phone' || undefined}
          aria-describedby={errorText ? 'login-code-err' : undefined}
          className={`${input} ${error === 'phone' ? 'border-red-400' : 'border-neutral-200'}`}
        />
        {errorText && (
          <p id="login-code-err" className="mt-2 text-xs font-medium text-red-600" role="alert">
            {errorText}
          </p>
        )}
        <button type="submit" disabled={busy} className={`${primary} mt-5`}>
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {busy ? t('sending') : t('sendCode')}
        </button>
        <p className="mt-4 text-center text-xs text-neutral-500">{t('firstTime')}</p>
      </form>
    )
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void verify()
      }}
    >
      <p className="rounded-xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700" role="status">
        {t('codeSent')}
      </p>
      <label htmlFor="login-otp" className="mb-1.5 mt-5 block text-sm font-semibold text-neutral-800">
        {t('code')}
      </label>
      <input
        ref={codeRef}
        id="login-otp"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        placeholder="••••••"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorText ? 'login-otp-err' : undefined}
        className={`${input} text-center font-mono text-2xl tracking-[0.5em] ${error ? 'border-red-400' : 'border-neutral-200'}`}
      />
      {errorText && (
        <p id="login-otp-err" className="mt-2 text-xs font-medium text-red-600" role="alert">
          {errorText}
        </p>
      )}
      <button type="submit" disabled={busy} className={`${primary} mt-5`}>
        {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {busy ? t('verifying') : t('verify')}
      </button>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            setStep('phone')
            setError(null)
          }}
          className="font-semibold text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
        >
          {t('changePhone')}
        </button>
        <button
          type="button"
          onClick={() => void request()}
          disabled={busy || cooldown > 0}
          className="font-semibold text-neutral-700 underline underline-offset-2 hover:text-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-400 disabled:no-underline"
        >
          {cooldown > 0 ? t('resendIn', { seconds: cooldown }) : t('resend')}
        </button>
      </div>
    </form>
  )
}
