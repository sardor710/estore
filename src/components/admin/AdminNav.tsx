'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity,
  BadgePercent,
  ClipboardList,
  Download,
  FolderTree,
  Languages,
  LayoutDashboard,
  LogOut,
  Newspaper,
  Package,
  Settings,
  ShieldCheck,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { can, permissionForPath, ROLE_LABELS, type Role } from '@/lib/permissions'

type Item = { href: string; label: string; icon: LucideIcon }
type Group = { label: string | null; items: Item[] }

// Each item is shown only when the role has the permission of its path (same mapping the pages enforce).
const GROUPS: Group[] = [
  { label: null, items: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'Sales',
    items: [
      { href: '/admin/orders', label: 'Orders', icon: ClipboardList },
      { href: '/admin/clients', label: 'Clients', icon: Users },
      { href: '/admin/promotions', label: 'Promotions', icon: BadgePercent },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { href: '/admin/products', label: 'Products', icon: Package },
      { href: '/admin/categories', label: 'Categories', icon: FolderTree },
      { href: '/admin/brands', label: 'Brands', icon: Tags },
      { href: '/admin/import', label: 'Import', icon: Download },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/admin/blog', label: 'Blog', icon: Newspaper },
      { href: '/admin/translations', label: 'Translations', icon: Languages },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/users', label: 'Users', icon: ShieldCheck },
      { href: '/admin/activity', label: 'Activity log', icon: Activity },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
]

function visibleGroups(role: Role): Group[] {
  return GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      const p = permissionForPath(i.href)
      return p !== null && can(role, p)
    }),
  })).filter((g) => g.items.length > 0)
}

export default function AdminNav({ staff }: { staff: { name: string; email: string; role: Role } }) {
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

  const isActive = (href: string) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`))
  const link = (active: boolean) =>
    `flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition md:rounded-xl ${
      active ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-200'
    }`

  return (
    <nav
      aria-label="Admin"
      className="sticky top-0 z-20 border-b border-neutral-200 bg-white md:h-screen md:w-56 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r"
    >
      <div className="flex items-center gap-2 overflow-x-auto px-3 py-2 md:flex-col md:items-stretch md:gap-1 md:overflow-visible md:p-4">
        <span className="hidden px-3 font-[family-name:var(--font-heading)] text-lg font-extrabold md:block">Admin</span>
        <span className="hidden truncate px-3 pb-3 text-xs text-neutral-500 md:block" title={staff.email}>
          {staff.name} · {ROLE_LABELS[staff.role]}
        </span>
        {visibleGroups(staff.role).map((g) => (
          <div key={g.label ?? 'top'} className="contents md:block md:pb-2" role="group" aria-label={g.label ?? undefined}>
            {g.label ? (
              <span className="hidden px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 md:block">{g.label}</span>
            ) : null}
            {g.items.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={link(isActive(href))} aria-current={isActive(href) ? 'page' : undefined}>
                <Icon size={16} aria-hidden />
                {label}
              </Link>
            ))}
          </div>
        ))}
        <button type="button" onClick={logout} disabled={busy} className={`${link(false)} md:mt-2`}>
          <LogOut size={16} aria-hidden />
          Logout
        </button>
      </div>
    </nav>
  )
}
