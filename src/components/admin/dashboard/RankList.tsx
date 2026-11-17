import { card } from '@/components/admin/ui'
import { fmtNum } from './KpiTiles'

export type RankItem = { label: string; value: number; /** Shown instead of the number when set (e.g. money). */ display?: string; sub?: string }

/** Ranked horizontal bars (length from zero, one hue); the number is always printed, so nothing is colour-only. */
export default function RankList({ title, items, empty = 'No data yet' }: { title: string; items: RankItem[]; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <section className={card}>
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">{title}</h2>
      {items.length === 0 ? (
        <p className="rounded-lg bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">{empty}</p>
      ) : (
        <ol className="space-y-2.5">
          {items.map((i) => (
            <li key={i.label} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-neutral-800" title={i.label}>
                  {i.label}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-neutral-900">{i.display ?? fmtNum(i.value)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-neutral-100" aria-hidden>
                <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }} />
              </div>
              {i.sub ? <div className="mt-0.5 text-xs text-neutral-500">{i.sub}</div> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
