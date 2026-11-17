import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/*
 * Admin design kit (light theme). Tokens — see the M1 design notes:
 * page bg neutral-100 · surface white + neutral-200 border + shadow-xs · accent indigo-600 (only accent)
 * text tiers neutral-900 / 700 / 500 / 400 (500 and 400 darkened for AA inside `.admin-ui`, see globals.css)
 * radius: controls rounded-lg (8px), surfaces rounded-xl (12px), badges/chips rounded-full
 * focus: 2px indigo-600 outline, offset 2px (inputs: indigo border + 3px soft ring)
 */

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
const btnBase = `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`

export const input =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-xs placeholder:text-neutral-400 transition-colors hover:border-neutral-400 focus:border-indigo-600 focus:outline-none focus:ring-3 focus:ring-indigo-600/20 disabled:bg-neutral-100 disabled:text-neutral-500'
export const btn = `${btnBase} bg-indigo-600 text-white shadow-xs hover:bg-indigo-700 active:bg-indigo-800`
export const btnGhost = `${btnBase} border border-neutral-300 bg-white text-neutral-800 shadow-xs hover:border-neutral-400 hover:bg-neutral-50`
export const btnDanger = `${btnBase} border border-red-300 bg-white text-red-700 shadow-xs hover:border-red-400 hover:bg-red-50`
export const btnSm = 'px-3 py-1 text-xs'
export const card = 'rounded-xl border border-neutral-200 bg-white p-4 shadow-xs sm:p-5'

/** Data tables: wrap in `<div className="overflow-x-auto">` inside a card with `p-0`. */
export const table = 'w-full border-collapse text-left text-sm'
export const th =
  'whitespace-nowrap border-b border-neutral-200 bg-neutral-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-500'
export const td = 'border-b border-neutral-100 px-3 py-3 align-middle text-neutral-800'

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{children}</h1>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-neutral-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-xs sm:p-4">
      {children}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
        <Icon size={22} aria-hidden />
      </span>
      <p className="text-base font-semibold text-neutral-900">{title}</p>
      {text ? <p className="mt-1 max-w-sm text-sm text-neutral-600">{text}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
      {children}
      {hint ? <span className="ml-2 font-normal normal-case tracking-normal text-neutral-400">{hint}</span> : null}
    </span>
  )
}

export function Notice({ kind, children }: { kind: 'ok' | 'error' | 'warn' | 'info'; children: ReactNode }) {
  const tone = {
    ok: 'border-green-200 bg-green-50 text-green-800',
    error: 'border-red-200 bg-red-50 text-red-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  }[kind]
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${tone}`}>
      {children}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'accent' | 'violet'
}) {
  const t = {
    neutral: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
    green: 'bg-green-50 text-green-800 ring-green-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    blue: 'bg-blue-50 text-blue-800 ring-blue-200',
    accent: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    violet: 'bg-violet-50 text-violet-800 ring-violet-200',
  }[tone]
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${t}`}>
      {children}
    </span>
  )
}
