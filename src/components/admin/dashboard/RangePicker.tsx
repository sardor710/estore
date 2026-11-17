import Link from 'next/link'
import { btn, btnGhost, input } from '@/components/admin/ui'
import type { RangeKey } from '@/lib/admin/dashboard'

const PRESETS: { key: Exclude<RangeKey, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
]

/** URL-driven range filter (no client state): presets are links, custom is a GET form. One row above the charts. */
export default function RangePicker({ active, from, to, maxDay }: { active: RangeKey; from: string; to: string; maxDay: string }) {
  const seg = (on: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${on ? 'bg-white text-indigo-700 shadow-xs ring-1 ring-neutral-200' : 'text-neutral-600 hover:bg-white/70 hover:text-neutral-900'}`
  const dateInput = `${input} mt-1 block !w-auto !py-1.5`
  return (
    <div className="mb-6 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-xs sm:p-4">
      <nav aria-label="Date range" className="inline-flex flex-wrap gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
        {PRESETS.map((p) => (
          <Link key={p.key} href={`/admin?range=${p.key}`} className={seg(active === p.key)} aria-current={active === p.key ? 'true' : undefined}>
            {p.label}
          </Link>
        ))}
      </nav>
      <form action="/admin" method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="range" value="custom" />
        <label className="text-xs font-semibold text-neutral-500">
          From
          <input type="date" name="from" defaultValue={from} max={maxDay} required className={dateInput} />
        </label>
        <label className="text-xs font-semibold text-neutral-500">
          To
          <input type="date" name="to" defaultValue={to} max={maxDay} required className={dateInput} />
        </label>
        <button type="submit" className={`${active === 'custom' ? btn : btnGhost} !py-1.5`}>
          Apply
        </button>
      </form>
    </div>
  )
}
