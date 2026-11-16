'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import type { Locale } from '@/i18n/routing'
import { formatUzs } from '@/lib/money'
import { path } from '@/lib/paths'
import { normalizeUzPhone } from '@/lib/phone'
import { useCart, useCartDrawer } from '@/lib/cart/useCart'
import { useQuote } from '@/lib/cart/useQuote'

type FieldErrors = Partial<Record<'name' | 'phone' | 'region' | 'address' | 'comment', string>>

export default function CheckoutForm({ locale, regions }: { locale: Locale; regions: { code: string; name: string }[] }) {
  const t = useTranslations('checkout')
  const tc = useTranslations('cart')
  const router = useRouter()
  const { lines, clear, remove } = useCart()
  const { setOpen: setCartOpen } = useCartDrawer()
  const { quote, loading, error: quoteError, reload } = useQuote(lines, locale)
  const [values, setValues] = useState({ name: '', phone: '', region: '', address: '', comment: '' })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
    if (!normalizeUzPhone(values.phone)) e.phone = t('errors.phone')
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
        body: JSON.stringify({ lines, ...values, locale }),
      })
      const data = (await res.json().catch(() => ({}))) as { number?: number; error?: string }
      if (res.ok && typeof data.number === 'number') {
        clear()
        router.replace(path(locale, `/order/${data.number}`))
        return // keep "submitting" so the empty-cart view does not flash
      }
      const known = ['BELOW_MIN', 'OUT_OF_STOCK', 'INVALID', 'RATE_LIMITED', 'SERVER'] as const
      const code = known.find((k) => k === data.error) ?? (res.status >= 500 ? 'SERVER' : 'INVALID')
      setFormError(t(`errors.${code}`))
      if (code !== 'RATE_LIMITED' && code !== 'SERVER') reload()
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
    <form onSubmit={onSubmit} noValidate className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
      <section aria-labelledby="co-details" className="space-y-5">
        <h2 id="co-details" className="text-lg font-bold text-neutral-900">
          {t('details')}
        </h2>
        {field(
          'name',
          t('name'),
          <input id="co-name" name="name" autoComplete="name" value={values.name} onChange={set('name')} className={`${input} ${border('name')}`} {...aria('name')} />,
        )}
        {field(
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
                {it?.available && <span className="whitespace-nowrap font-semibold">{formatUzs(it.priceUzs * l.qty, locale)}</span>}
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
          disabled={submitting || blocked}
          className="mt-4 w-full rounded-full bg-neutral-900 px-6 py-3.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {submitting ? t('submitting') : t('submit')}
        </button>
        <p className="mt-3 text-xs text-neutral-500">{t('note')}</p>
        <button type="button" onClick={() => setCartOpen(true)} className="mt-3 inline-block text-xs font-semibold text-neutral-700 underline">
          {t('editCart')}
        </button>
      </aside>
    </form>
  )
}
