'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { retryErpOutboxAction } from '@/app/admin/actions/erp'
import { btnGhost, btnSm } from '../ui'

export default function ErpRetryButton({ id }: { id: number }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const router = useRouter()
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={`${btnGhost} ${btnSm}`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await retryErpOutboxAction(id)
            setMsg(r.ok ? 'Queued' : r.error)
            router.refresh()
          })
        }
      >
        {pending ? 'Retrying…' : 'Retry'}
      </button>
      {msg ? <span className="text-xs text-neutral-500">{msg}</span> : null}
    </span>
  )
}
