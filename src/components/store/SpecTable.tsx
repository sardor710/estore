import type { SpecGroup } from '@/lib/catalog'
import type { L10n } from '@/lib/localized'
import type { Locale } from '@/i18n/routing'
import { t as l10n } from '@/lib/localized'

function humanize(key: string): string {
  const s = key.replace(/[-_]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Grouped specification table. Group and row labels come from the SpecLabel dictionary. */
export default function SpecTable({
  groups,
  labels,
  locale,
}: {
  groups: SpecGroup[]
  labels: Record<string, L10n>
  locale: Locale
}) {
  const label = (key: string) => l10n(labels[key], locale) || humanize(key)
  const visible = groups.filter((g) => Array.isArray(g.items) && g.items.length > 0)
  return (
    <div className="space-y-8">
      {visible.map((g) => (
        <table key={g.group} className="w-full border-collapse overflow-hidden rounded-xl text-left text-sm">
          <caption className="pb-3 text-left font-[family-name:var(--font-heading)] text-base font-bold text-neutral-900">
            {label(g.group)}
          </caption>
          <tbody>
            {g.items.map((item, i) => (
              <tr key={`${item.label}-${i}`} className="odd:bg-neutral-50 even:bg-white">
                <th scope="row" className="w-2/5 px-4 py-3 align-top font-semibold text-neutral-800">
                  {label(item.label)}
                </th>
                <td className="px-4 py-3 text-neutral-600">{l10n(item.valueL10n, locale) || item.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  )
}
