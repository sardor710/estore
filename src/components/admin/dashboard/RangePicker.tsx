import Link from 'next/link'
import { btn } from '@/components/admin/ui'
import type { RangeKey } from '@/lib/admin/dashboard'

const PRESETS: { key: Exclude<RangeKey, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
]

/** URL-driven range filter (no client state): presets are links, custom is a GET form. One row above the charts. */
export default function RangePicker({ active, from, to, maxDay }: { active: RangeKey; from: string; to: string; maxDay: string }) {
  const pill = (on: boolean) =>
    `rounded-full px-3 py-1 text-sm font-semibold transition ${on ? 'bg-neutral-900 text-white' : 'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100'}`
  return (
    <div className="mb-6 flex flex-wrap items-end gap-x-4 gap-y-3">
      <nav aria-label="Date range" className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Link key={p.key} href={`/admin?range=${p.key}`} className={pill(active === p.key)} aria-current={active === p.key ? 'true' : undefined}>
            {p.label}
          </Link>
        ))}
      </nav>
      <form action="/admin" method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="range" value="custom" />
        <label className="text-xs text-neutral-500">
          From
          <input type="date" name="from" defaultValue={from} max={maxDay} required className="mt-0.5 block rounded-lg border border-neutral-300 px-2 py-1 text-sm text-neutral-900" />
        </label>
        <label className="text-xs text-neutral-500">
          To
          <input type="date" name="to" defaultValue={to} max={maxDay} required className="mt-0.5 block rounded-lg border border-neutral-300 px-2 py-1 text-sm text-neutral-900" />
        </label>
        <button type="submit" className={`${btn} !px-3 !py-1.5 ${active === 'custom' ? '' : '!bg-neutral-700'}`}>
          Apply
        </button>
      </form>
    </div>
  )
}
