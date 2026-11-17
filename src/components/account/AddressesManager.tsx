'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { saveAddressAction, deleteAddressAction } from '@/app/[locale]/account/actions'
import LocationButton from '@/components/store/LocationButton'
import type { LatLng } from '@/lib/geo'

export type AddressItem = {
  id: number
  label: string
  recipient: string
  region: string
  address: string
  isDefault: boolean
  lat: number | null
  lng: number | null
}
type Region = { code: string; name: string }
type ActionError = 'AUTH' | 'INVALID' | 'LIMIT' | 'NOT_FOUND' | 'network'

/**
 * Saved addresses: cards, inline add/edit form, delete with confirmation, set default. The server actions
 * revalidate the account layout, so the `addresses` prop arrives fresh after every successful change.
 */
export default function AddressesManager({
  addresses,
  regions,
  max,
  defaultRecipient,
  prefillPin = null,
}: {
  addresses: AddressItem[]
  regions: Region[]
  max: number
  defaultRecipient: string
  /** A location sent to the bot ("New address" button): opens the new-address form with this pin attached. */
  prefillPin?: LatLng | null
}) {
  const t = useTranslations('account.addresses')
  const [editing, setEditing] = useState<number | 'new' | null>(prefillPin && addresses.length < max ? 'new' : null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<ActionError | null>(null)
  const atLimit = addresses.length >= max
  const regionName = (code: string) => regions.find((r) => r.code === code)?.name ?? code
  const errorText = (e: ActionError) => (e === 'LIMIT' ? t('errors.LIMIT', { max }) : t(`errors.${e}`))

  const run = async (id: number, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusyId(id)
    setError(null)
    try {
      const r = await fn()
      if (!r.ok) setError((r.error as ActionError) ?? 'INVALID')
    } catch {
      setError('network')
    }
    setBusyId(null)
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">{t('count', { count: addresses.length, max })}</p>
        {editing !== 'new' && (
          <button
            type="button"
            onClick={() => {
              setEditing('new')
              setConfirmDelete(null)
              setError(null)
            }}
            disabled={atLimit}
            className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            <Plus size={16} aria-hidden /> {t('add')}
          </button>
        )}
      </div>
      {atLimit && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          {t('limit', { max })}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {errorText(error)}
        </p>
      )}

      {editing === 'new' && (
        <AddressForm
          regions={regions}
          initial={{
            label: '',
            recipient: defaultRecipient,
            region: '',
            address: '',
            isDefault: addresses.length === 0,
            lat: prefillPin?.lat ?? null,
            lng: prefillPin?.lng ?? null,
          }}
          title={t('newTitle')}
          onCancel={() => setEditing(null)}
          onSaved={() => setEditing(null)}
          errorText={errorText}
        />
      )}

      {addresses.length === 0 && editing !== 'new' ? (
        <div className="mt-6 rounded-2xl bg-neutral-50 px-6 py-12 text-center">
          <MapPin size={32} className="mx-auto text-neutral-400" aria-hidden />
          <p className="mt-3 text-neutral-600">{t('empty')}</p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {addresses.map((a) =>
            editing === a.id ? (
              <li key={a.id} className="md:col-span-2">
                <AddressForm
                  regions={regions}
                  id={a.id}
                  initial={a}
                  title={t('editTitle')}
                  onCancel={() => setEditing(null)}
                  onSaved={() => setEditing(null)}
                  errorText={errorText}
                />
              </li>
            ) : (
              <li key={a.id} className={`flex flex-col rounded-2xl border bg-white p-5 ${a.isDefault ? 'border-neutral-900' : 'border-neutral-100'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  {a.label && <p className="font-bold text-neutral-900">{a.label}</p>}
                  {a.isDefault && (
                    <span className="rounded-full bg-neutral-900 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">{t('default')}</span>
                  )}
                </div>
                <p className="mt-1 text-sm font-semibold text-neutral-900">{a.recipient}</p>
                <p className="mt-1 text-sm text-neutral-600">{regionName(a.region)}</p>
                <p className="break-words text-sm text-neutral-600">{a.address}</p>

                {confirmDelete === a.id ? (
                  <div className="mt-4 rounded-xl bg-red-50 p-3" role="group" aria-label={t('deleteConfirm')}>
                    <p className="text-sm font-semibold text-red-800">{t('deleteConfirm')}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => run(a.id, () => deleteAddressAction(a.id)).then(() => setConfirmDelete(null))}
                        className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {busyId === a.id && <Loader2 size={14} className="animate-spin" aria-hidden />}
                        {t('deleteYes')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:border-neutral-400"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(a.id)
                        setConfirmDelete(null)
                        setError(null)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-800 hover:border-neutral-400"
                    >
                      <Pencil size={14} aria-hidden /> {t('edit')}
                    </button>
                    {!a.isDefault && (
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() =>
                          run(a.id, () =>
                            saveAddressAction({ id: a.id, label: a.label, recipient: a.recipient, region: a.region, address: a.address, isDefault: true, lat: a.lat, lng: a.lng }),
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-800 hover:border-neutral-400 disabled:opacity-60"
                      >
                        {busyId === a.id ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Star size={14} aria-hidden />}
                        {t('makeDefault')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDelete(a.id)
                        setError(null)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} aria-hidden /> {t('delete')}
                    </button>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}

type FormValues = { label: string; recipient: string; region: string; address: string; isDefault: boolean; lat: number | null; lng: number | null }
type FieldErrors = Partial<Record<'label' | 'recipient' | 'region' | 'address', string>>

function AddressForm({
  regions,
  id,
  initial,
  title,
  onCancel,
  onSaved,
  errorText,
}: {
  regions: Region[]
  id?: number
  initial: FormValues
  title: string
  onCancel(): void
  onSaved(): void
  errorText(e: ActionError): string
}) {
  const t = useTranslations('account.addresses')
  const uid = useId()
  const [v, setV] = useState<FormValues>({
    label: initial.label,
    recipient: initial.recipient,
    region: initial.region,
    address: initial.address,
    isDefault: initial.isDefault,
    lat: initial.lat,
    lng: initial.lng,
  })
  const pin: LatLng | null = v.lat != null && v.lng != null ? { lat: v.lat, lng: v.lng } : null
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((s) => ({ ...s, [k]: k === 'isDefault' ? (e.target as HTMLInputElement).checked : e.target.value }))

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const e: FieldErrors = {}
    if (v.label.trim().length > 40) e.label = t('errors.label')
    const r = v.recipient.trim().length
    if (r < 2 || r > 100) e.recipient = t('errors.recipient')
    if (!regions.some((x) => x.code === v.region)) e.region = t('errors.region')
    const a = v.address.trim().length
    if (a < 3 || a > 300) e.address = t('errors.address')
    setErrors(e)
    setFormError(null)
    if (Object.keys(e).length > 0) return
    setSaving(true)
    try {
      const res = await saveAddressAction({ ...(id ? { id } : {}), ...v })
      if (res.ok) {
        onSaved()
        return
      }
      setFormError(errorText(res.error))
    } catch {
      setFormError(errorText('network'))
    }
    setSaving(false)
  }

  const input = 'w-full rounded-xl border bg-white px-4 py-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900'
  const border = (k: keyof FieldErrors) => (errors[k] ? 'border-red-400' : 'border-neutral-200')
  const aria = (k: keyof FieldErrors) => ({ 'aria-invalid': errors[k] ? true : undefined, 'aria-describedby': errors[k] ? `${uid}-${k}-err` : undefined })
  const err = (k: keyof FieldErrors) =>
    errors[k] ? (
      <p id={`${uid}-${k}-err`} className="mt-1 text-xs font-medium text-red-600" role="alert">
        {errors[k]}
      </p>
    ) : null
  const label = 'mb-1.5 block text-sm font-semibold text-neutral-800'

  return (
    <form onSubmit={submit} noValidate className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 sm:p-6" aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className="text-lg font-bold text-neutral-900">
        {title}
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-label`} className={label}>
            {t('label')}
          </label>
          <input id={`${uid}-label`} value={v.label} onChange={set('label')} placeholder={t('labelPlaceholder')} maxLength={40} className={`${input} ${border('label')}`} {...aria('label')} />
          {err('label')}
        </div>
        <div>
          <label htmlFor={`${uid}-recipient`} className={label}>
            {t('recipient')}
          </label>
          <input id={`${uid}-recipient`} autoComplete="name" value={v.recipient} onChange={set('recipient')} className={`${input} ${border('recipient')}`} {...aria('recipient')} />
          {err('recipient')}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${uid}-region`} className={label}>
            {t('region')}
          </label>
          <select id={`${uid}-region`} value={v.region} onChange={set('region')} className={`${input} ${border('region')}`} {...aria('region')}>
            <option value="">{t('regionPlaceholder')}</option>
            {regions.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
          {err('region')}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${uid}-address`} className={label}>
            {t('address')}
          </label>
          <textarea id={`${uid}-address`} rows={2} autoComplete="street-address" value={v.address} onChange={set('address')} className={`${input} ${border('address')}`} {...aria('address')} />
          {errors.address ? err('address') : <p className="mt-1 text-xs text-neutral-500">{t('addressHint')}</p>}
        </div>
      </div>
      <div className="mt-4">
        <LocationButton value={pin} onChange={(p) => setV((s) => ({ ...s, lat: p?.lat ?? null, lng: p?.lng ?? null }))} />
      </div>
      <label className="mt-4 flex items-center gap-2.5 text-sm text-neutral-800">
        <input type="checkbox" checked={v.isDefault} onChange={set('isDefault')} className="h-4 w-4 accent-neutral-900" />
        {t('isDefault')}
      </label>
      {formError && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {formError}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-wait disabled:bg-neutral-500"
        >
          {saving && <Loader2 size={15} className="animate-spin" aria-hidden />}
          {saving ? t('saving') : t('save')}
        </button>
        <button type="button" onClick={onCancel} className="rounded-full border border-neutral-200 bg-white px-6 py-2.5 text-sm font-semibold text-neutral-800 hover:border-neutral-400">
          {t('cancel')}
        </button>
      </div>
    </form>
  )
}
