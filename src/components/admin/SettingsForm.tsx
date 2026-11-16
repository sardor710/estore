'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveSettingsAction, testTelegramAction } from '@/app/admin/actions'
import type { SettingsView } from '@/lib/admin/settings'
import { Badge, btn, btnGhost, card, input, Label, Notice } from './ui'

type Msg = { kind: 'ok' | 'error' | 'warn'; text: string } | null

export default function SettingsForm({ view, translationConfigured }: { view: SettingsView; translationConfigured: boolean }) {
  const router = useRouter()
  const [min, setMin] = useState(String(view.minOrderUzs))
  const [token, setToken] = useState('')
  const [clear, setClear] = useState(false)
  const [chat, setChat] = useState(view.telegramChatId)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<Msg>(null)
  const [pending, start] = useTransition()

  function save() {
    setMsg(null)
    const n = min.trim() === '' ? NaN : Number(min)
    start(async () => {
      const r = await saveSettingsAction({ minOrderUzs: n, telegramBotToken: token, clearTelegramToken: clear, telegramChatId: chat })
      if (!r.ok) {
        setErrors(r.errors)
        return setMsg({ kind: 'error', text: 'Not saved. Fix the highlighted fields.' })
      }
      setErrors({})
      setToken('')
      setClear(false)
      setMsg({ kind: 'ok', text: 'Settings saved.' })
      router.refresh()
    })
  }

  function test() {
    setMsg(null)
    start(async () => {
      const r = await testTelegramAction()
      setMsg(
        r === 'sent'
          ? { kind: 'ok', text: 'Sent: check your Telegram chat.' }
          : r === 'skipped'
            ? { kind: 'warn', text: 'Skipped: save a bot token and chat id first.' }
            : { kind: 'error', text: 'Failed: Telegram rejected the message or was unreachable. Check the token, the chat id, and that the bot was added to the chat.' },
      )
    })
  }

  const err = (k: string) => (errors[k] ? <p role="alert" className="mt-1 text-sm text-red-700">{errors[k]}</p> : null)

  return (
    <div className="space-y-4">
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}

      <section className={`${card} space-y-4`} aria-labelledby="ord">
        <h2 id="ord" className="font-bold">Orders</h2>
        <label className="block max-w-xs">
          <Label hint="UZS, 0 = no minimum">Minimum order</Label>
          <input className={input} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} />
          {err('minOrderUzs')}
        </label>
      </section>

      <section className={`${card} space-y-4`} aria-labelledby="tg">
        <h2 id="tg" className="font-bold">Telegram notifications</h2>
        <label className="block max-w-md">
          <Label hint={view.telegramTokenSet ? `stored: ${view.telegramTokenMasked}` : 'not set'}>Bot token</Label>
          <input
            className={`${input} font-mono text-xs`}
            type="password"
            autoComplete="off"
            placeholder={view.telegramTokenSet ? 'Leave empty to keep the stored token' : '123456:ABC...'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          {err('telegramBotToken')}
        </label>
        {view.telegramTokenSet ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} /> Remove the stored token
          </label>
        ) : null}
        <label className="block max-w-md">
          <Label>Chat id</Label>
          <input className={input} value={chat} onChange={(e) => setChat(e.target.value)} placeholder="-1001234567890" />
          {err('telegramChatId')}
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} disabled={pending} onClick={test}>
            Send test message
          </button>
          <span className="self-center text-xs text-neutral-500">Uses the saved values; save first if you changed them.</span>
        </div>
      </section>

      <section className={`${card} space-y-2`} aria-labelledby="trn">
        <h2 id="trn" className="font-bold">Machine translation</h2>
        <div className="flex items-center gap-2">
          <Badge tone={translationConfigured ? 'green' : 'amber'}>{translationConfigured ? 'Configured' : 'Not configured'}</Badge>
          <span className="text-sm text-neutral-600">{translationConfigured ? 'ANTHROPIC_API_KEY is set.' : 'Add ANTHROPIC_API_KEY to .env and restart the server to enable translation.'}</span>
        </div>
      </section>

      <button type="button" className={btn} disabled={pending} onClick={save}>
        Save settings
      </button>
    </div>
  )
}
