'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export type BarsPoint = { label: string; value: number }

const spaced = (n: number) => {
  const [int, frac] = String(Math.round(n * 10) / 10).split('.')
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (frac ? `.${frac}` : '')
}
const compact = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n))

/**
 * One measure over a fixed set of categories (hours of the day, weekdays): bars from a zero baseline, one hue.
 * The peak is stated in words (`note`), never by colour, and the collapsed table is the accessible view.
 */
export default function BarsChart({
  title,
  subtitle,
  data,
  color,
  note,
  categoryLabel,
  valueLabel,
}: {
  title: string
  /** What the bars measure, e.g. "Page views by hour of day". */
  subtitle: string
  data: BarsPoint[]
  color: string
  /** e.g. "Peak: 20:00–21:00". */
  note?: string
  /** Column headers of the data table and the tooltip name. */
  categoryLabel: string
  valueLabel: string
}) {
  const empty = data.every((p) => p.value === 0)
  const axis = { fontSize: 11, fill: '#737373' }
  return (
    <figure className="m-0">
      <figcaption className="mb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-sm font-semibold text-neutral-900">{title}</span>
          {note && !empty ? <span className="text-xs font-semibold text-neutral-700">{note}</span> : null}
        </div>
        <div className="text-xs text-neutral-500">{subtitle}</div>
      </figcaption>
      {empty ? (
        <div className="flex h-[200px] items-center justify-center rounded-lg bg-neutral-50 text-sm text-neutral-500">No data yet</div>
      ) : (
        <div role="img" aria-label={`${title}. ${subtitle}.${note ? ` ${note}.` : ''}`}>
          <ResponsiveContainer width="100%" height={200} initialDimension={{ width: 600, height: 200 }}>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="#e5e5e5" />
              <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={{ stroke: '#d4d4d4' }} minTickGap={8} />
              <YAxis tickFormatter={compact} tick={axis} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                formatter={(v) => [spaced(Number(v)), valueLabel]}
                labelFormatter={(l) => `${categoryLabel} ${l}`}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 12 }}
              />
              <Bar dataKey="value" fill={color} maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {!empty && (
        <details className="mt-1 text-xs text-neutral-600">
          <summary className="cursor-pointer select-none py-1">Data table</summary>
          <div className="max-h-48 overflow-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="py-1 pr-3 font-semibold">{categoryLabel}</th>
                  <th className="py-1 text-right font-semibold">{valueLabel}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.label} className="border-t border-neutral-100">
                    <td className="py-1 pr-3">{p.label}</td>
                    <td className="py-1 text-right tabular-nums">{spaced(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </figure>
  )
}
