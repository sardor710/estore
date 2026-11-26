'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ImageIcon } from 'lucide-react'
import type { ProductRow, ProductSort } from '@/lib/admin/product-list'
import { Badge, table, td, th } from './ui'
import BulkBar, { type Option } from './BulkBar'
import InlineVariantCell from './InlineVariantCell'

type Row = Omit<ProductRow, 'updatedAt' | 'createdAt'> & { updated: string }

const sth = `${th} sticky top-0 z-10`

function Completeness({ score, missing }: { score: number; missing: string[] }) {
  const tone = score >= 100 ? 'bg-green-500' : score >= 50 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div title={missing.length ? `Missing: ${missing.join('; ')}` : 'Complete'} className="w-24">
      <div className="mb-0.5 text-xs font-semibold tabular-nums text-neutral-700">{score}%</div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-label="Completeness" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${tone}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}

/** Sortable column header: a link that sorts by this column (toggling direction when already sorted by it). */
function SortHeader({ col, label, sort, dir, hrefs, className = '' }: { col: ProductSort; label: string; sort: ProductSort; dir: 'asc' | 'desc'; hrefs: Record<ProductSort, string>; className?: string }) {
  const active = sort === col
  return (
    <th scope="col" className={`${sth} ${className}`} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <Link href={hrefs[col]} className={`inline-flex items-center gap-1 rounded transition-colors hover:text-neutral-900 ${active ? 'text-indigo-700' : ''}`}>
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
      <div className="overflow-auto rounded-xl border border-neutral-200 bg-white shadow-xs md:max-h-[calc(100dvh-14rem)]">
        <table className={`${table} table-fixed md:min-w-[900px] md:table-auto`}>
          <thead>
            <tr>
              <th scope="col" className={`${sth} w-10 !pr-1 sm:pl-4`}>
                <input
                  className="size-4 align-middle"
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
              <SortHeader col="price" label="Price (UZS)" sort={sort} dir={dir} hrefs={sortHrefs} className="hidden text-right md:table-cell" />
              <SortHeader col="stock" label="Stock" sort={sort} dir={dir} hrefs={sortHrefs} className="hidden text-right md:table-cell" />
              <th scope="col" className={`${sth} hidden md:table-cell`}>
                Completeness
              </th>
              <SortHeader col="updated" label="Updated" sort={sort} dir={dir} hrefs={sortHrefs} className="hidden md:table-cell" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={`align-top transition-colors ${picked.includes(p.id) ? 'bg-indigo-50/60' : 'hover:bg-neutral-50'}`}>
                <td className={`${td} !pr-1 !align-top sm:pl-4`}>
                  <input className="mt-0.5 size-4" type="checkbox" aria-label={`Select ${p.title}`} checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                </td>
                <td className={`${td} !align-top`}>
                  <div className="flex gap-3">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="size-14 shrink-0 rounded-lg border border-neutral-200 bg-white object-contain p-0.5" />
                    ) : (
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-neutral-400">
                        <ImageIcon size={18} aria-hidden />
                      </div>
                    )}
                    <div className="min-w-0">
                      <Link href={`/admin/products/${p.id}`} className="font-semibold text-neutral-900 underline-offset-2 hover:text-indigo-700 hover:underline">
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
                      {p.variants.length ? (
                        // Phones: the price/stock columns are hidden, so list the variants (picture, color, name) here, read-only.
                        <ul className="mt-2 space-y-1.5 md:hidden" aria-label={`Variants of ${p.title}`}>
                          {p.variants.slice(0, 3).map((v) => (
                            <li key={v.id} className="flex items-center gap-2 text-xs">
                              {v.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={v.image} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-md border border-neutral-200 bg-white object-contain" />
                              ) : (
                                <span className="h-8 w-8 shrink-0 rounded-md border border-dashed border-neutral-300 bg-neutral-50" />
                              )}
                              {v.colorHex ? <span aria-hidden className="h-3 w-3 shrink-0 rounded-full border border-neutral-300" style={{ backgroundColor: v.colorHex }} /> : null}
                              <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">{v.name}</span>
                              <span className="shrink-0 tabular-nums text-neutral-700">{v.priceUzs.toLocaleString('en-US')}</span>
                              <span className={`w-12 shrink-0 text-right tabular-nums ${v.stock <= lowStockThreshold ? 'font-semibold text-amber-700' : 'text-neutral-500'}`}>{v.stock} pcs</span>
                            </li>
                          ))}
                          {p.variants.length > 3 ? <li className="text-xs text-neutral-500">+{p.variants.length - 3} more variants</li> : null}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className={`${td} hidden !align-top md:table-cell`} colSpan={p.variants.length ? 2 : 1}>
                  {p.variants.length ? (
                    <div className="space-y-1.5">
                      {p.variants.map((v) => {
                        const who = v.name === v.sku ? v.sku : `${v.name} (${v.sku})`
                        return (
                          <div key={v.id} className="grid grid-cols-[minmax(0,1fr)_7.5rem_4.5rem] items-center gap-2">
                            <div className="flex min-w-0 items-center gap-2" title={who}>
                              {v.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={v.image} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-md border border-neutral-200 bg-white object-contain" />
                              ) : (
                                <div className="h-8 w-8 shrink-0 rounded-md border border-dashed border-neutral-300 bg-neutral-50" />
                              )}
                              {v.colorHex ? (
                                <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full border border-neutral-300 shadow-inner" style={{ backgroundColor: v.colorHex }} />
                              ) : null}
                              <div className="min-w-0 leading-tight">
                                <div className="line-clamp-2 break-words text-xs font-medium text-neutral-800">{v.name}</div>
                                {v.name !== v.sku ? <div className="truncate font-mono text-[10px] text-neutral-500">{v.sku}</div> : null}
                              </div>
                            </div>
                            {v.erpManaged ? (
                              <>
                                <span className="text-right text-xs tabular-nums text-neutral-700" title="Managed in ERP (erp2.zanko.uz)">{v.priceUzs.toLocaleString('en-US')}</span>
                                <span className={`text-right text-xs tabular-nums ${v.stock <= lowStockThreshold ? 'font-semibold text-amber-700' : 'text-neutral-700'}`} title="Managed in ERP (erp2.zanko.uz)">
                                  {v.stock} <span className="text-[10px] font-semibold text-indigo-600">ERP</span>
                                </span>
                              </>
                            ) : (
                              <>
                                <InlineVariantCell variantId={v.id} field="priceUzs" value={v.priceUzs} label={`Price of ${who}`} />
                                <InlineVariantCell variantId={v.id} field="stock" value={v.stock} label={`Stock of ${who}`} low={v.stock <= lowStockThreshold} />
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-500">no variants</span>
                  )}
                </td>
                {p.variants.length ? null : <td className={`${td} hidden md:table-cell`} />}
                <td className={`${td} hidden !align-top md:table-cell`}>
                  <Completeness score={p.completeness} missing={p.missing} />
                </td>
                <td className={`${td} hidden whitespace-nowrap !align-top text-xs text-neutral-600 sm:pr-4 md:table-cell`}>{p.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
