'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { formatUzs } from '@/lib/money'
import { path } from '@/lib/paths'
import { normalizeUzPhone } from '@/lib/phone'
import { formatPhone } from '@/components/account/format'
import { useCart, useCartDrawer } from '@/lib/cart/useCart'
import { useQuote } from '@/lib/cart/useQuote'
import { useTgMainButton } from '@/components/tg/useTg'
import LocationButton from './LocationButton'
import type { LatLng } from '@/lib/geo'

type FieldErrors = Partial<Record<'name' | 'phone' | 'region' | 'address' | 'comment', string>>

export type CheckoutAddress = {
  id: number
  label: string
  recipient: string
  region: string
  address: string
  isDefault: boolean
  lat?: number | null
  lng?: number | null
}
/** Signed-in shopper (null = guest checkout, unchanged). */
export type CheckoutAccount = { name: string; phone: string; addresses: CheckoutAddress[] }

export default function CheckoutForm({
  locale,
  regions,
  account = null,
  telegram = false,
  cardPayments = false,
  octoTest = false,
}: {
  locale: Locale
  regions: { code: string; name: string }[]
  account?: CheckoutAccount | null
  /** Telegram Mini App: Telegram's MainButton places the order (the in-page submit button is hidden). */
  telegram?: boolean
  /** Octo is configured: offer "Pay online by card" next to cash on delivery. */
  cardPayments?: boolean
  /** Octo test-mode checkout (?octo_test=1): the server only accepts card orders in test mode with this flag. */
  octoTest?: boolean
}) {
  const t = useTranslations('checkout')
  const tc = useTranslations('cart')
  const router = useRouter()
  const { lines, clear, remove } = useCart()
  const { setOpen: setCartOpen } = useCartDrawer()
  const { quote, loading, error: quoteError, reload } = useQuote(lines, locale)
  const saved = account?.addresses ?? []
  // Same limit as MAX_ADDRESSES in src/lib/account/addresses.ts (server-only module): at the limit the option is hidden
  // instead of being silently ignored by the server.
  const canSaveAddress = saved.length < 10
  const preselected = saved.find((a) => a.isDefault) ?? saved[0] ?? null
  // Saved address id, or 'new'. Choosing a saved address fills recipient (name), region and address.
  const [choice, setChoice] = useState<number | 'new'>(preselected ? preselected.id : 'new')
  const [saveNew, setSaveNew] = useState(false)
  const [payment, setPayment] = useState<'cash' | 'card'>('cash')
  const [newLabel, setNewLabel] = useState('')
  const [values, setValues] = useState(() => ({
    name: preselected?.recipient ?? account?.name ?? '',
    phone: account?.phone ?? '',
    region: preselected?.region ?? '',
    address: preselected?.address ?? '',
    comment: '',
  }))
  const [errors, setErrors] = useState<FieldErrors>({})
  const pinOf = (a: CheckoutAddress | null | undefined): LatLng | null => (a && a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null)
  // Optional delivery pin; a saved address brings its own pin along.
  const [pin, setPin] = useState<LatLng | null>(() => pinOf(preselected))

  const choose = (c: number | 'new') => {
    setChoice(c)
    const a = c === 'new' ? null : saved.find((x) => x.id === c)
    setPin(pinOf(a))
    setValues((v) => (a ? { ...v, name: a.recipient, region: a.region, address: a.address } : { ...v, name: account?.name || v.name, region: '', address: '' }))
    setErrors((e) => ({ ...e, name: undefined, region: undefined, address: undefined }))
  }
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const tTg = useTranslations('tg')
  const mainTotal = quote?.totalUzs ?? 0
  // same rule as `blocked` below (computed here because hooks run before the empty-cart return)
  const mainBlocked =
    !quote ||
    mainTotal <= 0 ||
    mainTotal < quote.minOrderUzs ||
    quote.items.some((i) => !i.available || i.stock === 0 || (i.available && i.stock > 0 && i.qty > i.stock))
  const tgButton = useTgMainButton(
    telegram && lines.length > 0 && quote && mainTotal > 0 ? tTg('placeOrderButton', { total: formatUzs(mainTotal, locale) }) : null,
    () => formRef.current?.requestSubmit(),
    { disabled: submitting || mainBlocked, progress: submitting },
  )

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }))

  if (lines.length === 0 && !submitting) {
    return (
      <div className="mt-8 rounded-2xl bg-neutral-50 px-6 py-12 text-center">
        <p className="text-neutral-600">{t('empty')}</p>
        <Link href={path(locale)} className="mt-4 inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white hover:bg-neutral-700">
          {t('backToShop')}
        </Link>
      </div>
    )
  }

  const items = quote?.items ?? []
  const byId = new Map(items.map((i) => [i.variantId, i]))
  const total = quote?.totalUzs ?? 0
  const min = quote?.minOrderUzs ?? 0
  const belowMin = quote != null && total < min
  const hasUnavailable = items.some((i) => !i.available || i.stock === 0)
  const overStock = items.some((i) => i.available && i.stock > 0 && i.qty > i.stock)
  const blocked = !quote || belowMin || hasUnavailable || overStock || total <= 0

  const validate = (): FieldErrors => {
    const e: FieldErrors = {}
    if (values.name.trim().length < 2) e.name = t('errors.name')
    if (!account && !normalizeUzPhone(values.phone)) e.phone = t('errors.phone')
    if (!regions.some((r) => r.code === values.region)) e.region = t('errors.region')
    if (values.address.trim().length < 3) e.address = t('errors.address')
    if (values.comment.trim().length > 500) e.comment = t('errors.comment')
    return e
  }

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (submitting) return
    setFormError(null)
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length > 0 || blocked) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lines,
          ...values,
          locale,
          location: pin,
          ...(cardPayments && payment === 'card' ? { payment: 'card', ...(octoTest ? { octoTest: true } : {}) } : {}),
          // Signed in: the server uses the account phone anyway; optionally keep the new address.
          ...(account && choice === 'new' && canSaveAddress && saveNew ? { saveAddress: { label: newLabel.trim() } } : {}),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { number?: number; error?: string; token?: string; payUrl?: string }
      if (res.ok && typeof data.number === 'number') {
        clear()
        // Card: off to Octo's payment page (also inside the Telegram Mini App webview); it returns to the order page.
        if (data.payUrl) {
          window.location.assign(data.payUrl)
          return
        }
        router.replace(path(locale, `/order/${data.number}${data.token ? `?t=${encodeURIComponent(data.token)}` : ''}`))
        return // keep "submitting" so the empty-cart view does not flash
      }
      const known = ['BELOW_MIN', 'OUT_OF_STOCK', 'INVALID', 'RATE_LIMITED', 'BLOCKED', 'SERVER', 'CARD_UNAVAILABLE'] as const
      const code = known.find((k) => k === data.error) ?? (res.status >= 500 ? 'SERVER' : 'INVALID')
      setFormError(t(`errors.${code}`))
      if (code !== 'RATE_LIMITED' && code !== 'SERVER' && code !== 'BLOCKED' && code !== 'CARD_UNAVAILABLE') reload()
    } catch {
      setFormError(t('errors.NETWORK'))
    }
    setSubmitting(false)
  }

  const input =
    'w-full rounded-xl border bg-white px-4 py-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900'
  const field = (id: keyof FieldErrors, label: string, control: React.ReactNode, hint?: string) => (
    <div>
      <label htmlFor={`co-${id}`} className="mb-1.5 block text-sm font-semibold text-neutral-800">
        {label}
      </label>
      {control}
      {hint && !errors[id] && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
      {errors[id] && (
        <p id={`co-${id}-err`} className="mt-1 text-xs font-medium text-red-600" role="alert">
          {errors[id]}
        </p>
      )}
    </div>
  )
  const aria = (id: keyof FieldErrors) => ({ 'aria-invalid': errors[id] ? true : undefined, 'aria-describedby': errors[id] ? `co-${id}-err` : undefined })
  const border = (id: keyof FieldErrors) => (errors[id] ? 'border-red-400' : 'border-neutral-200')

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
      <section aria-labelledby="co-details" className="space-y-5">
        <h2 id="co-details" className="text-lg font-bold text-neutral-900">
          {t('details')}
        </h2>
        {field(
          'name',
          t('name'),
          <input id="co-name" name="name" autoComplete="name" value={values.name} onChange={set('name')} className={`${input} ${border('name')}`} {...aria('name')} />,
        )}
        {account ? (
          <div>
            <label htmlFor="co-phone" className="mb-1.5 block text-sm font-semibold text-neutral-800">
              {t('phone')}
            </label>
            <input
              id="co-phone"
              name="phone"
              type="tel"
              readOnly
              value={formatPhone(account.phone)}
              aria-describedby="co-phone-hint"
              className={`${input} border-neutral-200 bg-neutral-50 text-neutral-600`}
            />
            <p id="co-phone-hint" className="mt-1 text-xs text-neutral-500">
              <span className="font-semibold text-neutral-700">{t('fromAccount')}.</span> {t('phoneLocked')}
            </p>
          </div>
        ) : field(
          'phone',
          t('phone'),
          <input
            id="co-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t('phonePlaceholder')}
            value={values.phone}
            onChange={set('phone')}
            className={`${input} ${border('phone')}`}
            {...aria('phone')}
          />,
        )}
        {account && saved.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-neutral-800">{t('savedAddresses')}</legend>
            <div className="space-y-2">
              {saved.map((a) => (
                <label
                  key={a.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-neutral-900 ${
                    choice === a.id ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  <input type="radio" name="co-saved" checked={choice === a.id} onChange={() => choose(a.id)} className="mt-0.5 h-4 w-4 accent-neutral-900" />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-semibold text-neutral-900">
                      {a.label || a.recipient}
                      {a.isDefault && (
                        <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{t('defaultAddress')}</span>
                      )}
                    </span>
                    <span className="block break-words text-neutral-600">
                      {a.label ? `${a.recipient}, ` : ''}
                      {regions.find((r) => r.code === a.region)?.name ?? a.region}, {a.address}
                    </span>
                  </span>
                </label>
              ))}
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-neutral-900 ${
                  choice === 'new' ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-400'
                }`}
              >
                <input type="radio" name="co-saved" checked={choice === 'new'} onChange={() => choose('new')} className="h-4 w-4 accent-neutral-900" />
                {t('newAddress')}
              </label>
            </div>
          </fieldset>
        )}
        {field(
          'region',
          t('region'),
          <select id="co-region" name="region" value={values.region} onChange={set('region')} className={`${input} ${border('region')}`} {...aria('region')}>
            <option value="">{t('regionPlaceholder')}</option>
            {regions.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>,
        )}
        {field(
          'address',
          t('address'),
          <textarea
            id="co-address"
            name="address"
            rows={2}
            autoComplete="street-address"
            value={values.address}
            onChange={set('address')}
            className={`${input} ${border('address')}`}
            {...aria('address')}
          />,
          t('addressHint'),
        )}
        {account && choice === 'new' && canSaveAddress && (
          <div className="rounded-xl bg-neutral-50 p-4">
            <label className="flex items-center gap-2.5 text-sm font-semibold text-neutral-800">
              <input type="checkbox" checked={saveNew} onChange={(e) => setSaveNew(e.target.checked)} className="h-4 w-4 accent-neutral-900" />
              {t('saveAddress')}
            </label>
            {saveNew && (
              <div className="mt-3">
                <label htmlFor="co-label" className="mb-1.5 block text-sm font-semibold text-neutral-800">
                  {t('addressLabel')}
                </label>
                <input
                  id="co-label"
                  value={newLabel}
                  maxLength={40}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={t('addressLabelPlaceholder')}
                  className={`${input} border-neutral-200`}
                />
              </div>
            )}
          </div>
        )}
        <LocationButton
          value={pin}
          onChange={setPin}
          address={values.address}
          region={regions.find((r) => r.code === values.region)?.name}
          onAddress={(address, region) => {
            setValues((v) => ({ ...v, address, region: region && regions.some((r) => r.code === region) ? region : v.region }))
            setErrors((e) => ({ ...e, address: undefined, region: region ? undefined : e.region }))
          }}
        />
        {field(
          'comment',
          t('comment'),
          <textarea id="co-comment" name="comment" rows={2} value={values.comment} onChange={set('comment')} className={`${input} ${border('comment')}`} {...aria('comment')} />,
        )}
      </section>

      <aside aria-labelledby="co-summary" className="h-fit rounded-2xl border border-neutral-100 bg-neutral-50 p-5 lg:sticky lg:top-24">
        <h2 id="co-summary" className="text-lg font-bold text-neutral-900">
          {t('yourOrder')}
        </h2>
        <ul className="mt-4 divide-y divide-neutral-200">
          {lines.map((l) => {
            const it = byId.get(l.variantId)
            const bad = quote != null && (!it || !it.available || it.stock === 0)
            return (
              <li key={l.variantId} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900">{bad ? tc('unavailable') : (it?.title ?? '...')}</p>
                  {it?.variantName && <p className="text-xs text-neutral-500">{it.variantName}</p>}
                  <p className="text-xs text-neutral-500">x{l.qty}</p>
                </div>
                {it?.available && (
                  <span className="flex flex-col items-end whitespace-nowrap leading-tight">
                    <span className="font-semibold">{formatUzs(it.priceUzs * l.qty, locale)}</span>
                    {it.originalUzs > it.priceUzs && <s className="text-xs text-neutral-400">{formatUzs(it.originalUzs * l.qty, locale)}</s>}
                  </span>
                )}
                {bad && (
                  <button
                    type="button"
                    onClick={() => remove(l.variantId)}
                    aria-label={tc('remove', { name: it?.title || tc('unavailable') })}
                    className="shrink-0 rounded-full p-1.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
                  >
                    <X size={16} aria-hidden />
                  </button>
                )}
              </li>
            )
          })}
        </ul>

        <dl className="mt-4 space-y-2 border-t border-neutral-200 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-600">{t('delivery')}</dt>
            <dd className={belowMin ? 'text-neutral-400' : 'font-semibold text-emerald-700'}>{belowMin ? '-' : t('freeDelivery')}</dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-neutral-600">{t('total')}</dt>
            <dd className="text-xl font-extrabold text-neutral-900">{quote ? formatUzs(total, locale) : loading ? tc('loading') : ''}</dd>
          </div>
        </dl>

        {cardPayments && (
          <fieldset className="mt-4 border-t border-neutral-200 pt-4">
            <legend className="mb-2 text-sm font-semibold text-neutral-900">{t('payment')}</legend>
            <div className="grid gap-2">
              {(['cash', 'card'] as const).map((m) => (
                <label
                  key={m}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm ${payment === m ? 'border-neutral-900 bg-white' : 'border-neutral-200 bg-white/60'}`}
                >
                  <input type="radio" name="payment" value={m} checked={payment === m} onChange={() => setPayment(m)} className="mt-0.5 accent-neutral-900" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-neutral-900">{m === 'cash' ? t('payCash') : t('payCard')}</span>
                    <span className="block text-xs text-neutral-500">{m === 'cash' ? t('payCashHint') : t('payCardHint')}</span>
                    {m === 'card' && (
                      <span className="mt-1.5 flex flex-wrap gap-1" aria-hidden>
                        {['Uzcard', 'Humo', 'Visa', 'Mastercard'].map((b) => (
                          <span key={b} className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-600">
                            {b}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {quoteError && (
          <p className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {tc('quoteError')}
            <button type="button" onClick={reload} className="font-semibold underline">
              {tc('retry')}
            </button>
          </p>
        )}
        {belowMin && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
            {t('belowMin', { min: formatUzs(min, locale), amount: formatUzs(min - total, locale) })}
          </p>
        )}
        {hasUnavailable && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('unavailableLines')}</p>}
        {overStock && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('stockLines')}</p>}
        {formError && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {formError}
          </p>
        )}

        <button
          type="submit"
          hidden={tgButton}
          disabled={submitting || blocked}
          className="mt-4 w-full rounded-full bg-neutral-900 px-6 py-3.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {submitting ? t('submitting') : cardPayments && payment === 'card' ? t('submitCard') : t('submit')}
        </button>
        <p className="mt-3 text-xs text-neutral-500">{t('note')}</p>
        <p className="mt-2 text-xs text-neutral-500">
          {t.rich('legal', {
            offer: (c) => <Link href={`/${locale}/legal/offer`} target="_blank" className="underline">{c}</Link>,
            warranty: (c) => <Link href={`/${locale}/legal/warranty`} target="_blank" className="underline">{c}</Link>,
            privacy: (c) => <Link href={`/${locale}/legal/privacy`} target="_blank" className="underline">{c}</Link>,
          })}
        </p>
        <button type="button" onClick={() => setCartOpen(true)} className="mt-3 inline-block text-xs font-semibold text-neutral-700 underline">
          {t('editCart')}
        </button>
      </aside>
    </form>
  )
}
