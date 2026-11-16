'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ClipboardList, Package, Download, FolderTree, Languages, Settings, LogOut } from 'lucide-react'
import { useState } from 'react'

const ITEMS = [
  { href: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { href: '/admin/products', label: 'Products', icon: Package },
  { href: '/admin/import', label: 'Import', icon: Download },
  { href: '/admin/categories', label: 'Categories', icon: FolderTree },
  { href: '/admin/translations', label: 'Translations', icon: Languages },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
]

export default function AdminNav() {
  const path = usePathname()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function logout() {
    setBusy(true)
    try {
      await fetch('/api/admin/logout', { method: 'POST' })
    } finally {
      router.replace('/admin/login')
      router.refresh()
    }
  }

  const link = (active: boolean) =>
    `flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition md:rounded-xl ${
      active ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-200'
    }`

  return (
    <nav
      aria-label="Admin"
      className="sticky top-0 z-20 border-b border-neutral-200 bg-white md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r"
    >
      <div className="flex items-center gap-2 overflow-x-auto px-3 py-2 md:flex-col md:items-stretch md:gap-1 md:overflow-visible md:p-4">
        <span className="hidden px-3 pb-3 font-[family-name:var(--font-heading)] text-lg font-extrabold md:block">Admin</span>
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={link(path === href || path.startsWith(`${href}/`))} aria-current={path.startsWith(href) ? 'page' : undefined}>
            <Icon size={16} aria-hidden />
            {label}
          </Link>
        ))}
        <button type="button" onClick={logout} disabled={busy} className={`${link(false)} md:mt-4`}>
          <LogOut size={16} aria-hidden />
          Logout
        </button>
      </div>
    </nav>
  )
}
