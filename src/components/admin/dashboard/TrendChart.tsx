'use client'

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export type TrendPoint = { day: string; value: number }

const spaced = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const compact = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n))
const shortDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`

/**
 * One measure, one axis (never dual-axis): revenue as bars (baseline zero), counts as a line.
 * The collapsed table is the accessible view of the same numbers.
 */
export default function TrendChart({
  title,
  data,
  kind,
  color,
  unit,
}: {
  title: string
  data: TrendPoint[]
  kind: 'bar' | 'line'
  color: string
  /** Appended to values in the tooltip and table, e.g. "so'm". */
  unit?: string
}) {
  const empty = data.every((p) => p.value === 0)
  const fmt = (n: number) => (unit ? `${spaced(n)} ${unit}` : spaced(n))
  const axis = { fontSize: 11, fill: '#737373' }
  const grid = <CartesianGrid vertical={false} stroke="#e5e5e5" />
  const x = <XAxis dataKey="day" tickFormatter={shortDay} tick={axis} tickLine={false} axisLine={{ stroke: '#d4d4d4' }} minTickGap={24} />
  const y = <YAxis tickFormatter={compact} tick={axis} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
  const tip = (
    <Tooltip
      cursor={kind === 'bar' ? { fill: 'rgba(0,0,0,0.05)' } : { stroke: '#a3a3a3' }}
      formatter={(v) => [fmt(Number(v)), title]}
      labelFormatter={(d) => String(d)}
      contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 12 }}
    />
  )
  return (
    <figure className="m-0">
      <figcaption className="mb-2 text-sm font-semibold text-neutral-900">{title}</figcaption>
      {empty ? (
        <div className="flex h-[200px] items-center justify-center rounded-lg bg-neutral-50 text-sm text-neutral-500">No data yet</div>
      ) : (
        <div role="img" aria-label={`${title}: ${data.length} days, total ${fmt(data.reduce((s, p) => s + p.value, 0))}`}>
          <ResponsiveContainer width="100%" height={200} initialDimension={{ width: 600, height: 200 }}>
            {kind === 'bar' ? (
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                {grid}
                {x}
                {y}
                {tip}
                <Bar dataKey="value" fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            ) : (
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                {grid}
                {x}
                {y}
                {tip}
                <Line dataKey="value" stroke={color} strokeWidth={2} dot={data.length <= 31 ? { r: 3, fill: color, stroke: '#fff', strokeWidth: 2 } : false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
              </LineChart>
            )}
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
                  <th className="py-1 pr-3 font-semibold">Day</th>
                  <th className="py-1 text-right font-semibold">{title}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.day} className="border-t border-neutral-100">
                    <td className="py-1 pr-3">{p.day}</td>
                    <td className="py-1 text-right tabular-nums">{fmt(p.value)}</td>
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
