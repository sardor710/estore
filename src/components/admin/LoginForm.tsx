'use client'

import { useState } from 'react'
import { btn, input, Label, Notice } from './ui'

export default function LoginForm({ configured }: { configured: boolean }) {
  const [error, setError] = useState<string | null>(configured ? null : 'Admin not configured')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user: fd.get('user'), password: fd.get('password') }),
      })
      if (res.ok) {
        window.location.assign('/admin/orders')
        return
      }
      setError(
        res.status === 429
          ? 'Too many attempts. Wait a minute and try again.'
          : res.status === 503
            ? 'Admin not configured'
            : res.status === 403
              ? 'Request blocked (origin mismatch).'
              : 'Wrong username or password.',
      )
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <Notice kind="error">{error}</Notice> : null}
      <div>
        <label htmlFor="admin-user" className="block">
          <Label>Username</Label>
        </label>
        <input id="admin-user" name="user" autoComplete="username" required aria-label="Username" className={input} />
      </div>
      <div>
        <label htmlFor="admin-password" className="block">
          <Label>Password</Label>
        </label>
        <input id="admin-password" name="password" type="password" autoComplete="current-password" required aria-label="Password" className={input} />
      </div>
      <button type="submit" disabled={busy || !configured} className={`${btn} w-full`}>
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  )
}
