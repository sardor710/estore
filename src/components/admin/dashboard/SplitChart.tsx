'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TrafficDay } from '@/lib/admin/traffic'
import { SERIES_COLOR } from './series-colors'

const spaced = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const compact = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n))
const shortDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`

const SERIES = [
  { key: 'signedIn', label: 'Signed-in', color: SERIES_COLOR.signedIn },
  { key: 'guests', label: 'Guests', color: SERIES_COLOR.guests },
  { key: 'unknown', label: 'Unknown', color: SERIES_COLOR.unknown },
] as const

/**
 * Daily unique visitors, stacked: signed-in customers, guests, and visitors whose status was not recorded.
 * Parts of one whole on one axis; the legend names every series and the table repeats the numbers.
 */
export default function SplitChart({ data }: { data: TrafficDay[] }) {
  const total = (d: TrafficDay) => d.signedIn + d.guests + d.unknown
  const empty = data.every((d) => total(d) === 0)
  // "Unknown" only appears when it exists, so a fully tracked range is not cluttered by an empty series.
  const shown = SERIES.filter((s) => s.key !== 'unknown' || data.some((d) => d.unknown > 0))
  const axis = { fontSize: 11, fill: '#737373' }
  const sum = data.reduce((s, d) => s + total(d), 0)
  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-semibold text-neutral-900">Visitors per day</span>
        {!empty && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-700">
            {shown.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </figcaption>
      {empty ? (
        <div className="flex h-[220px] items-center justify-center rounded-lg bg-neutral-50 text-sm text-neutral-500">No data yet</div>
      ) : (
        <div role="img" aria-label={`Visitors per day: ${data.length} days, ${spaced(sum)} daily visitors in total, split into ${shown.map((s) => s.label.toLowerCase()).join(', ')}`}>
          <ResponsiveContainer width="100%" height={220} initialDimension={{ width: 600, height: 220 }}>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e5e5e5" />
              <XAxis dataKey="day" tickFormatter={shortDay} tick={axis} tickLine={false} axisLine={{ stroke: '#d4d4d4' }} minTickGap={24} />
              <YAxis tickFormatter={compact} tick={axis} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                formatter={(v, name) => [spaced(Number(v)), String(name)]}
                labelFormatter={(d) => String(d)}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 12 }}
              />
              {shown.map((s) => (
                // The white stroke is the 2px surface gap between stacked segments.
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="visitors" fill={s.color} stroke="#fff" strokeWidth={2} maxBarSize={28} isAnimationActive={false} />
              ))}
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
                  <th className="py-1 pr-3 font-semibold">Day</th>
                  {shown.map((s) => (
                    <th key={s.key} className="py-1 pl-3 text-right font-semibold">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.day} className="border-t border-neutral-100">
                    <td className="py-1 pr-3">{d.day}</td>
                    {shown.map((s) => (
                      <td key={s.key} className="py-1 pl-3 text-right tabular-nums">
                        {spaced(d[s.key])}
                      </td>
                    ))}
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
