'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createUserAction, resetPasswordAction, updateUserAction } from '@/app/admin/actions/users'
import { ROLE_LABELS, ROLES, isRole, type Role } from '@/lib/permissions'
import { Badge, btn, btnDanger, btnGhost, btnSm, card, input, Label, Notice } from './ui'

export type UserRow = { id: number; email: string; name: string; role: string; active: boolean; lastLoginAt: string | null }

type Msg = { kind: 'ok' | 'error'; text: string } | null

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', dateStyle: 'medium', timeStyle: 'short' })

export default function UsersEditor({ users, currentUserId }: { users: UserRow[]; currentUserId: number }) {
  const router = useRouter()
  const [msg, setMsg] = useState<Msg>(null)
  const [pending, start] = useTransition()
  const [form, setForm] = useState({ email: '', name: '', role: 'PRODUCT_MANAGER' as Role, password: '' })
  const [resetFor, setResetFor] = useState<number | null>(null)
  const [newPw, setNewPw] = useState('')

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string, after?: () => void) {
    setMsg(null)
    start(async () => {
      const r = await action()
      if (!r.ok) return setMsg({ kind: 'error', text: r.error })
      setMsg({ kind: 'ok', text: okText })
      after?.()
      router.refresh()
    })
  }

  function create(e: React.FormEvent) {
    e.preventDefault()
    run(() => createUserAction(form), `Created ${form.email.trim()}.`, () => setForm({ email: '', name: '', role: 'PRODUCT_MANAGER', password: '' }))
  }

  return (
    <div className="space-y-6">
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}

      <section className={card} aria-labelledby="staff-list">
        <h2 id="staff-list" className="mb-3 text-base font-semibold text-neutral-900">Staff accounts</h2>
        <ul className="divide-y divide-neutral-100">
          {users.map((u) => {
            const self = u.id === currentUserId
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-neutral-900">{u.name}</span>
                    {self ? <Badge tone="blue">You</Badge> : null}
                    {u.active ? null : <Badge tone="red">Disabled</Badge>}
                  </div>
                  <div className="truncate text-sm text-neutral-600">{u.email}</div>
                  <div className="text-xs text-neutral-500">Last sign-in: {u.lastLoginAt ? fmt.format(new Date(u.lastLoginAt)) : 'never'}</div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <span className="sr-only">Role of {u.email}</span>
                  <select
                    className={`${input} w-auto`}
                    value={u.role}
                    disabled={pending || self}
                    title={self ? 'You cannot change your own role' : undefined}
                    onChange={(e) => {
                      const role = e.target.value
                      if (isRole(role)) run(() => updateUserAction(u.id, { role }), `${u.email} is now ${ROLE_LABELS[role]}.`)
                    }}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={`${u.active ? btnDanger : btnGhost} ${btnSm}`}
                  disabled={pending || self}
                  onClick={() => run(() => updateUserAction(u.id, { active: !u.active }), `${u.email} ${u.active ? 'disabled' : 'enabled'}.`)}
                >
                  {u.active ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  className={`${btnGhost} ${btnSm}`}
                  disabled={pending}
                  aria-expanded={resetFor === u.id}
                  onClick={() => {
                    setResetFor(resetFor === u.id ? null : u.id)
                    setNewPw('')
                  }}
                >
                  Reset password
                </button>
                {resetFor === u.id ? (
                  <form
                    className="flex w-full flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      run(() => resetPasswordAction(u.id, newPw), `Password reset for ${u.email}; their other sessions were signed out.`, () => {
                        setResetFor(null)
                        setNewPw('')
                      })
                    }}
                  >
                    <label className="block min-w-60 flex-1">
                      <Label hint="at least 10 characters">New password for {u.email}</Label>
                      <input className={input} type="password" autoComplete="new-password" minLength={10} required value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                    </label>
                    <button type="submit" className={btn} disabled={pending}>
                      Set password
                    </button>
                  </form>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>

      <section className={card} aria-labelledby="new-user">
        <h2 id="new-user" className="mb-3 text-base font-semibold text-neutral-900">Add a staff member</h2>
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <Label>Email</Label>
            <input className={input} type="email" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="block">
            <Label>Name</Label>
            <input className={input} required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="block">
            <Label>Role</Label>
            <select
              className={input}
              value={form.role}
              onChange={(e) => {
                const role = e.target.value
                if (isRole(role)) setForm({ ...form, role })
              }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <Label hint="at least 10 characters">Initial password</Label>
            <input
              className={input}
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className={btn} disabled={pending}>
              Create user
            </button>
          </div>
        </form>
        <p className="mt-3 text-xs text-neutral-500">
          Full admin: everything, including users, activity log and integration settings. Product manager: everything except those.
          Blog editor: the blog only.
        </p>
      </section>
    </div>
  )
}
