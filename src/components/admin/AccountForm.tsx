'use client'

import { useState, useTransition } from 'react'
import { changeOwnPasswordAction } from '@/app/admin/actions/account'
import { btn, card, input, Label, Notice } from './ui'

const EMPTY = { current: '', password: '', confirm: '' }

export default function AccountForm() {
  const [form, setForm] = useState(EMPTY)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (form.password !== form.confirm) return setMsg({ kind: 'error', text: 'The new passwords do not match.' })
    start(async () => {
      const r = await changeOwnPasswordAction(form)
      if (!r.ok) return setMsg({ kind: 'error', text: r.error })
      setForm(EMPTY)
      setMsg({ kind: 'ok', text: 'Password changed. Your other sessions were signed out.' })
    })
  }

  const field = (key: keyof typeof EMPTY, label: string, autoComplete: string, hint?: string) => (
    <label className="block">
      <Label hint={hint}>{label}</Label>
      <input
        className={input}
        type="password"
        required
        minLength={key === 'current' ? undefined : 10}
        autoComplete={autoComplete}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  )

  return (
    <section className={card} aria-labelledby="pw">
      <h2 id="pw" className="mb-4 border-b border-neutral-100 pb-3 text-base font-semibold text-neutral-900">Change password</h2>
      <form onSubmit={submit} className="max-w-md space-y-4">
        {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
        {field('current', 'Current password', 'current-password')}
        {field('password', 'New password', 'new-password', 'at least 10 characters')}
        {field('confirm', 'Repeat new password', 'new-password')}
        <button type="submit" className={btn} disabled={pending}>
          {pending ? 'Saving...' : 'Change password'}
        </button>
      </form>
    </section>
  )
}
