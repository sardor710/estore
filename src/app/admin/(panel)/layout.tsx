import type { ReactNode } from 'react'
import { requireStaff } from '@/lib/admin/session'
import AdminNav from '@/components/admin/AdminNav'

export default async function PanelLayout({ children }: { children: ReactNode }) {
  // Authentication for the shell; each page also calls requirePermission for its own section.
  const staff = await requireStaff()
  return (
    <div className="admin-ui min-h-screen md:flex">
      <a href="#admin-main" className="admin-skip-link">
        Skip to content
      </a>
      <AdminNav staff={{ name: staff.name, email: staff.email, role: staff.role }} />
      <main id="admin-main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  )
}
