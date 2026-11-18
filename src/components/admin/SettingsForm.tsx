'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { connectBotWebhookAction, saveSettingsAction, testTelegramAction } from '@/app/admin/actions'
import type { SettingsInput, SettingsView } from '@/lib/admin/settings'
import { Badge, btn, btnGhost, card, input, Label, Notice } from './ui'

type Msg = { kind: 'ok' | 'error' | 'warn'; text: string } | null

const SHOP_FIELDS: [keyof SettingsView['shop'], string, string, string][] = [
  ['shopLegalName', 'Legal name (seller)', 'company or individual entrepreneur', 'OOO "Zanko" / YaTT Familiya Ism'],
  ['shopInn', 'INN (STIR)', '9 digits', '123456789'],
  ['shopAddress', 'Legal address', 'also where warranty items are accepted', 'Tashkent, ... district, ... street, 1'],
  ['shopPhone', 'Phone', 'customer support', '+998 90 123-45-67'],
  ['shopEmail', 'Email', 'optional', 'support@zanko.uz'],
  ['shopTelegram', 'Telegram support', 'optional', '@zanko_support'],
  ['shopHours', 'Working hours', 'optional', 'Mon–Sat 10:00–19:00'],
]

const num = (s: string) => (s.trim() === '' ? NaN : Number(s))

/** Integration sections (Telegram, translation key status) render only when `view.integrations` is true. */
export default function SettingsForm({ view, translationConfigured }: { view: SettingsView; translationConfigured: boolean | null }) {
  const router = useRouter()
  const [min, setMin] = useState(String(view.minOrderUzs))
  const [vip, setVip] = useState(String(view.vipThresholdUzs))
  const [low, setLow] = useState(String(view.lowStockThreshold))
  const [shop, setShop] = useState(view.shop)
  const [token, setToken] = useState('')
  const [clear, setClear] = useState(false)
  const [chat, setChat] = useState(view.integrations ? view.telegramChatId : '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<Msg>(null)
  const [botStatus, setBotStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  function save() {
    setMsg(null)
    const input: SettingsInput = {
      minOrderUzs: num(min),
      vipThresholdUzs: num(vip),
      lowStockThreshold: num(low),
      shop,
      // Integration fields are only sent by staff who can see them; the server re-checks anyway.
      ...(view.integrations ? { telegramBotToken: token, clearTelegramToken: clear, telegramChatId: chat } : {}),
    }
    start(async () => {
      const r = await saveSettingsAction(input)
      if (!r.ok) {
        setErrors(r.errors)
        return setMsg({ kind: 'error', text: r.errors._ ?? 'Not saved. Fix the highlighted fields.' })
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

  function connectBot() {
    setBotStatus(null)
    start(async () => {
      const r = await connectBotWebhookAction()
      setBotStatus(
        r.ok
          ? { ok: true, text: `Customers can now sign in through ${r.username ? `@${r.username}` : 'the bot'}.` }
          : { ok: false, text: r.error },
      )
    })
  }

  const err = (k: string) => (errors[k] ? <p role="alert" className="mt-1 text-sm text-red-700">{errors[k]}</p> : null)

  return (
    <div className="space-y-4">
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}

      <section className={`${card} space-y-4`} aria-labelledby="biz">
        <h2 id="biz" className="text-base font-semibold text-neutral-900">Business</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <Label hint="UZS, 0 = no minimum">Minimum order</Label>
            <input className={input} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} />
            {err('minOrderUzs')}
          </label>
          <label className="block">
            <Label hint="UZS spent">VIP client threshold</Label>
            <input className={input} inputMode="numeric" value={vip} onChange={(e) => setVip(e.target.value)} />
            {err('vipThresholdUzs')}
          </label>
          <label className="block">
            <Label hint="units">Low-stock threshold</Label>
            <input className={input} inputMode="numeric" value={low} onChange={(e) => setLow(e.target.value)} />
            {err('lowStockThreshold')}
          </label>
        </div>
      </section>

      <section className={`${card} space-y-4`} aria-labelledby="shop">
        <div>
          <h2 id="shop" className="text-base font-semibold text-neutral-900">Shop details</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Shown in the site footer and in the Public offer, Privacy policy and Warranty pages. Fill in the legal name and INN (STIR) before launch: the public offer
            needs them to be a valid contract.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {SHOP_FIELDS.map(([k, label, hint, placeholder]) => (
            <label key={k} className={`block ${k === 'shopAddress' ? 'sm:col-span-2' : ''}`}>
              <Label hint={hint}>{label}</Label>
              <input className={input} value={shop[k]} placeholder={placeholder} onChange={(e) => setShop({ ...shop, [k]: e.target.value })} />
              {err(k)}
            </label>
          ))}
        </div>
      </section>

      {view.integrations ? (
        <>
          <section className={`${card} space-y-4`} aria-labelledby="tg">
            <h2 id="tg" className="text-base font-semibold text-neutral-900">Telegram notifications</h2>
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
            <div className="space-y-2 border-t border-neutral-100 pt-4">
              <h3 className="text-sm font-semibold text-neutral-900">Customer sign-in bot</h3>
              <p className="text-sm text-neutral-600">
                Lets shoppers sign in with Telegram. Registers this site&apos;s address (SITE_URL, https only) with Telegram so the bot
                answers customers. Uses the saved bot token. For local development run <code className="text-xs">npm run bot:poll</code> instead.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={btnGhost} disabled={pending} onClick={connectBot}>
                  Connect bot to website
                </button>
                {botStatus ? (
                  <Badge tone={botStatus.ok ? 'green' : 'amber'}>{botStatus.ok ? 'Connected' : 'Not connected'}</Badge>
                ) : null}
              </div>
              {botStatus ? (
                <p role="status" className={`text-sm ${botStatus.ok ? 'text-neutral-600' : 'text-red-700'}`}>
                  {botStatus.text}
                </p>
              ) : null}
            </div>
          </section>

          <section className={`${card} space-y-2`} aria-labelledby="trn">
            <h2 id="trn" className="text-base font-semibold text-neutral-900">Machine translation</h2>
            <div className="flex items-center gap-2">
              <Badge tone={translationConfigured ? 'green' : 'amber'}>{translationConfigured ? 'Configured' : 'Not configured'}</Badge>
              <span className="text-sm text-neutral-600">
                {translationConfigured ? 'ANTHROPIC_API_KEY is set.' : 'Add ANTHROPIC_API_KEY to .env and restart the server to enable translation.'}
              </span>
            </div>
          </section>
        </>
      ) : (
        <p className="text-sm text-neutral-500">Integration settings (Telegram, API keys) are managed by a full admin.</p>
      )}

      <button type="button" className={btn} disabled={pending} onClick={save}>
        Save settings
      </button>
    </div>
  )
}
