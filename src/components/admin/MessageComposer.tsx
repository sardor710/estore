'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Send, X } from 'lucide-react'
import { broadcastMessageAction, sendClientMessageAction } from '@/app/admin/actions/messages'
import MessageMedia from '@/components/MessageMedia'
import { btn, btnGhost, input, Label, Notice } from './ui'

const TEXT_MAX = 2000
const CAPTION_MAX = 1024
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4'

type Props =
  | { mode: 'client'; customerId: number }
  | { mode: 'broadcast'; accounts: number; telegram: number }

type Media = { url: string; kind: string }

/** Uploads one attachment with progress (fetch has no upload progress). */
function upload(file: File, onProgress: (pct: number) => void): Promise<Media> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/admin/message-media')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => {
      let body: { url?: string; kind?: string; error?: string } = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {}
      if (xhr.status === 200 && body.url && body.kind) resolve({ url: body.url, kind: body.kind })
      else reject(new Error(body.error || (xhr.status === 413 ? 'File is too large (photos 10 MB, videos 50 MB).' : 'Upload failed.')))
    }
    xhr.onerror = () => reject(new Error('Upload failed (network).'))
    const form = new FormData()
    form.set('file', file)
    xhr.send(form)
  })
}

/**
 * Post composer: text and/or one photo, GIF or MP4 video. Client mode: one customer. Broadcast mode: every customer
 * with an account (asks to confirm). Customers get exactly this post: no header, no extra buttons.
 */
export default function MessageComposer(props: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [media, setMedia] = useState<Media | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const max = media ? CAPTION_MAX : TEXT_MAX
  const uploading = progress !== null

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setOk(null)
    setProgress(0)
    try {
      setMedia(await upload(file, setProgress))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setProgress(null)
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)
    if (props.mode === 'broadcast' && !confirm(`Send this post to all ${props.accounts} customers with an account?`)) return
    const payload = { text, mediaUrl: media?.url ?? null }
    start(async () => {
      if (props.mode === 'client') {
        const r = await sendClientMessageAction(props.customerId, payload)
        if (!r.ok) return setError(r.error)
        setOk(
          r.telegram === 'sent'
            ? 'Sent. It is in the customer’s account and in their Telegram chat.'
            : r.telegram === 'failed'
              ? 'Saved in the customer’s account, but Telegram delivery failed (they may have blocked the bot).'
              : 'Saved in the customer’s account (no Telegram chat linked).',
        )
      } else {
        const r = await broadcastMessageAction(payload)
        if (!r.ok) return setError(r.error)
        setOk(`Sent to ${r.recipients} customers. Telegram copies are going out now; refresh to see the counts.`)
      }
      setText('')
      setMedia(null)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {ok ? <Notice kind="ok">{ok}</Notice> : null}

      {media ? (
        <div className="relative inline-block">
          <MessageMedia url={media.url} kind={media.kind} className="max-h-64" />
          <button
            type="button"
            onClick={() => setMedia(null)}
            className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white hover:bg-black"
            aria-label="Remove attachment"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      <label className="block">
        <Label hint={`${text.length}/${max}`}>{media ? 'Caption (optional)' : 'Text'}</Label>
        <textarea
          className={input}
          rows={props.mode === 'broadcast' ? 6 : 4}
          maxLength={max}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Plain text. Customers get exactly this post in the Telegram bot and in their account (Messages)."
        />
      </label>
      {media && text.length > CAPTION_MAX ? <Notice kind="warn">With a photo or video the text can be at most {CAPTION_MAX} characters.</Notice> : null}

      {props.mode === 'broadcast' ? (
        <p className="text-xs text-neutral-500">
          Goes to {props.accounts} customers with an account (blocked clients excluded). {props.telegram} of them also get it in Telegram; the others
          turned notifications off or have no chat.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={pick} />
        <button type="button" className={btnGhost} disabled={uploading || pending} onClick={() => fileRef.current?.click()}>
          <ImagePlus size={16} aria-hidden />
          {uploading ? `Uploading… ${progress}%` : media ? 'Replace photo/video' : 'Add photo/video'}
        </button>
        <button
          type="submit"
          className={btn}
          disabled={pending || uploading || (!text.trim() && !media) || text.length > max || (props.mode === 'broadcast' && props.accounts === 0)}
        >
          <Send size={16} aria-hidden />
          {pending ? 'Sending…' : props.mode === 'broadcast' ? 'Send to all' : 'Send'}
        </button>
        <span className="text-xs text-neutral-500">Photo up to 10 MB (JPG, PNG, WEBP, GIF) · video up to 50 MB (MP4)</span>
      </div>
    </form>
  )
}
