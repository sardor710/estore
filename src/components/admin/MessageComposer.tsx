'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { broadcastMessageAction, sendClientMessageAction } from '@/app/admin/actions/messages'
import { btn, input, Label, Notice } from './ui'

const MAX = 2000

type Props =
  | { mode: 'client'; customerId: number }
  | { mode: 'broadcast'; accounts: number; telegram: number }

/** Textarea + Send. Client mode: one customer. Broadcast mode: every customer with an account (asks to confirm). */
export default function MessageComposer(props: Props) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)
    if (props.mode === 'broadcast' && !confirm(`Send this message to all ${props.accounts} customers with an account?`)) return
    start(async () => {
      if (props.mode === 'client') {
        const r = await sendClientMessageAction(props.customerId, text)
        if (!r.ok) return setError(r.error)
        setOk(
          r.telegram === 'sent'
            ? 'Sent. It is in the customer’s account and in their Telegram chat.'
            : r.telegram === 'failed'
              ? 'Saved in the customer’s account, but Telegram delivery failed (they may have blocked the bot).'
              : 'Saved in the customer’s account (no Telegram chat linked).',
        )
      } else {
        const r = await broadcastMessageAction(text)
        if (!r.ok) return setError(r.error)
        setOk(`Sent to ${r.recipients} customers. Telegram copies are going out now; refresh to see the counts.`)
      }
      setText('')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {ok ? <Notice kind="ok">{ok}</Notice> : null}
      <label className="block">
        <Label hint={`${text.length}/${MAX}`}>Message</Label>
        <textarea
          className={input}
          rows={props.mode === 'broadcast' ? 6 : 4}
          maxLength={MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Plain text. The customer sees it in their account (Messages) and in the Telegram bot."
        />
      </label>
      {props.mode === 'broadcast' ? (
        <p className="text-xs text-neutral-500">
          Goes to {props.accounts} customers with an account (blocked clients excluded). {props.telegram} of them also get it in Telegram; the others
          turned notifications off or have no chat.
        </p>
      ) : null}
      <button type="submit" className={btn} disabled={pending || !text.trim() || (props.mode === 'broadcast' && props.accounts === 0)}>
        <Send size={16} aria-hidden />
        {pending ? 'Sending…' : props.mode === 'broadcast' ? 'Send to all' : 'Send'}
      </button>
    </form>
  )
}
