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
  Menu,
  MessageSquare,
  GalleryHorizontal,
  Newspaper,
  Package,
  Settings,
  SearchCheck,
  ShieldCheck,
  Store,
  Tags,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { can, permissionForPath, ROLE_LABELS, type Role } from '@/lib/permissions'

/** `always`: shown to every signed-in role (the page only requires a session). */
type Item = { href: string; label: string; icon: LucideIcon; always?: boolean }
type Group = { label: string | null; items: Item[] }

// Each item is shown only when the role has the permission of its path (same mapping the pages enforce).
const GROUPS: Group[] = [
  { label: null, items: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'Sales',
    items: [
      { href: '/admin/orders', label: 'Orders', icon: ClipboardList },
      { href: '/admin/clients', label: 'Clients', icon: Users },
      { href: '/admin/messages', label: 'Messages', icon: MessageSquare },
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
      { href: '/admin/seo', label: 'SEO', icon: SearchCheck },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/admin/banners', label: 'Banners', icon: GalleryHorizontal },
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
  { label: 'Me', items: [{ href: '/admin/account', label: 'Account', icon: UserRound, always: true }] },
]

function visibleGroups(role: Role): Group[] {
  return GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (i.always) return true
      const p = permissionForPath(i.href)
      return p !== null && can(role, p)
    }),
  })).filter((g) => g.items.length > 0)
}

export default function AdminNav({ staff }: { staff: { name: string; email: string; role: Role } }) {
  const path = usePathname()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  // Mobile menu is open only for the path it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === path
  const menuId = useId()

  async function logout() {
    setBusy(true)
    try {
      await fetch('/api/admin/logout', { method: 'POST' })
    } finally {
      router.replace('/admin/login')
      router.refresh()
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenOn(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const groups = visibleGroups(staff.role)
  const isActive = (href: string) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`))
  const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
  const link = (active: boolean) =>
    `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${focusRing} ${
      active ? 'bg-indigo-50 font-semibold text-indigo-700' : 'font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
    }`
  const initials =
    staff.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'

  const brand = (
    <Link href="/admin" className={`flex items-center gap-2.5 rounded-lg ${focusRing}`}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
        <Store size={17} aria-hidden />
      </span>
      <span className="font-[family-name:var(--font-heading)] text-base font-bold tracking-tight text-neutral-900">Store admin</span>
    </Link>
  )

  const items = (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.label ?? 'top'} role="group" aria-label={g.label ?? undefined}>
          {g.label ? (
            <span className="mb-1 block px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{g.label}</span>
          ) : null}
          <ul className="space-y-0.5">
            {g.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href)
              return (
                <li key={href}>
                  <Link href={href} className={link(active)} aria-current={active ? 'page' : undefined}>
                    <Icon size={17} aria-hidden className={active ? 'text-indigo-600' : 'text-neutral-500 group-hover:text-neutral-700'} />
                    {label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )

  const account = (
    <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-neutral-900" title={staff.email}>
          {staff.name}
        </span>
        <span className="block truncate text-xs text-neutral-500">{ROLE_LABELS[staff.role]}</span>
      </span>
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        aria-label="Logout"
        title="Logout"
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-white hover:text-red-700 disabled:opacity-50 ${focusRing}`}
      >
        <LogOut size={16} aria-hidden />
      </button>
    </div>
  )

  return (
    <>
      {/* Mobile: compact top bar; the menu button opens the nav below it. */}
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          {brand}
          <button
            type="button"
            onClick={() => setOpenOn(open ? null : path)}
            aria-expanded={open}
            aria-controls={menuId}
            className={`flex size-10 items-center justify-center rounded-lg border border-neutral-300 bg-white text-neutral-800 shadow-xs transition-colors hover:bg-neutral-50 ${focusRing}`}
          >
            {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
            <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>
        <nav
          id={menuId}
          aria-label="Admin"
          hidden={!open}
          className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-neutral-200 bg-white px-3 pb-4 pt-3 shadow-lg"
        >
          {items}
          <div className="mt-5">{account}</div>
        </nav>
      </header>

      {/* Desktop: sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-neutral-200 bg-white md:flex">
        <div className="flex h-16 shrink-0 items-center px-4">{brand}</div>
        <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
          {items}
        </nav>
        <div className="border-t border-neutral-200 p-3">{account}</div>
      </aside>
    </>
  )
}
