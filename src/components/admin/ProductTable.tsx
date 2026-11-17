'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { ProductRow, ProductSort } from '@/lib/admin/product-list'
import { Badge } from './ui'
import BulkBar, { type Option } from './BulkBar'
import InlineVariantCell from './InlineVariantCell'

type Row = Omit<ProductRow, 'updatedAt' | 'createdAt'> & { updated: string }

function Completeness({ score, missing }: { score: number; missing: string[] }) {
  const tone = score >= 100 ? 'bg-green-500' : score >= 50 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div title={missing.length ? `Missing: ${missing.join('; ')}` : 'Complete'} className="w-24">
      <div className="mb-0.5 text-xs font-semibold tabular-nums text-neutral-700">{score}%</div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-label="Completeness" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${tone}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}

/** Sortable column header: a link that sorts by this column (toggling direction when already sorted by it). */
function SortHeader({ col, label, sort, dir, hrefs, className = '' }: { col: ProductSort; label: string; sort: ProductSort; dir: 'asc' | 'desc'; hrefs: Record<ProductSort, string>; className?: string }) {
  const active = sort === col
  return (
    <th scope="col" className={`pb-2 pr-3 ${className}`} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <Link href={hrefs[col]} className={`inline-flex items-center gap-1 hover:text-neutral-900 ${active ? 'text-neutral-900' : ''}`}>
        {label}
        {active ? dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden /> : null}
      </Link>
    </th>
  )
}

export default function ProductTable({
  rows,
  sort,
  dir,
  sortHrefs,
  lowStockThreshold,
  categories,
  brands,
  promotions,
}: {
  rows: Row[]
  sort: ProductSort
  dir: 'asc' | 'desc'
  sortHrefs: Record<ProductSort, string>
  lowStockThreshold: number
  categories: Option[]
  brands: Option[]
  promotions: Option[]
}) {
  const [selected, setSelected] = useState<number[]>([])
  const visible = new Set(rows.map((r) => r.id))
  const picked = selected.filter((id) => visible.has(id))
  const all = rows.length > 0 && picked.length === rows.length
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const titles = Object.fromEntries(rows.map((r) => [r.id, r.title]))

  return (
    <>
      <BulkBar selected={picked} titles={titles} categories={categories} brands={brands} promotions={promotions} onDone={() => setSelected([])} />
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="text-xs uppercase text-neutral-500">
            <tr>
              <th scope="col" className="w-8 pb-2 pr-2">
                <input
                  type="checkbox"
                  aria-label="Select all products on this page"
                  checked={all}
                  ref={(el) => {
                    if (el) el.indeterminate = picked.length > 0 && !all
                  }}
                  onChange={() => setSelected(all ? [] : rows.map((r) => r.id))}
                />
              </th>
              <SortHeader col="title" label="Product" sort={sort} dir={dir} hrefs={sortHrefs} />
              <SortHeader col="price" label="Price (UZS)" sort={sort} dir={dir} hrefs={sortHrefs} className="text-right" />
              <SortHeader col="stock" label="Stock" sort={sort} dir={dir} hrefs={sortHrefs} className="text-right" />
              <th scope="col" className="pb-2 pr-3">
                Completeness
              </th>
              <SortHeader col="updated" label="Updated" sort={sort} dir={dir} hrefs={sortHrefs} />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={`border-t border-neutral-100 align-top ${picked.includes(p.id) ? 'bg-neutral-50' : ''}`}>
                <td className="py-2 pr-2">
                  <input type="checkbox" aria-label={`Select ${p.title}`} checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                </td>
                <td className="py-2 pr-3">
                  <div className="flex gap-3">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-neutral-100 object-cover" />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded-lg bg-neutral-100" />
                    )}
                    <div className="min-w-0">
                      <Link href={`/admin/products/${p.id}`} className="font-semibold text-neutral-900 underline-offset-2 hover:underline">
                        {p.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone={p.status === 'PUBLISHED' ? 'green' : 'amber'}>{p.status}</Badge>
                        {p.isDemo ? <Badge tone="blue">Demo</Badge> : null}
                        {p.promo ? <Badge tone="red">Promo: {p.promo}</Badge> : null}
                        {p.stockState === 'out' ? <Badge tone="red">Out of stock</Badge> : p.lowStock ? <Badge tone="amber">Low stock</Badge> : null}
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {[p.brand, p.category].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-2 pr-3" colSpan={p.variants.length ? 2 : 1}>
                  {p.variants.length ? (
                    <div className="space-y-1">
                      {p.variants.map((v) => (
                        <div key={v.id} className="grid grid-cols-[minmax(0,1fr)_7.5rem_4.5rem] items-start gap-2">
                          <span className="truncate pt-1 text-right font-mono text-[11px] text-neutral-500" title={v.name}>
                            {p.variants.length > 1 ? v.sku : ''}
                          </span>
                          <InlineVariantCell variantId={v.id} field="priceUzs" value={v.priceUzs} label={`Price of ${v.sku}`} />
                          <InlineVariantCell variantId={v.id} field="stock" value={v.stock} label={`Stock of ${v.sku}`} low={v.stock <= lowStockThreshold} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-500">no variants</span>
                  )}
                </td>
                {p.variants.length ? null : <td className="py-2 pr-3" />}
                <td className="py-2 pr-3">
                  <Completeness score={p.completeness} missing={p.missing} />
                </td>
                <td className="whitespace-nowrap py-2 text-xs text-neutral-600">{p.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
