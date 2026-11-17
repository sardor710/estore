import type { ReactNode } from 'react'
import { requireStaff } from '@/lib/admin/session'
import AdminNav from '@/components/admin/AdminNav'

export default async function PanelLayout({ children }: { children: ReactNode }) {
  // Authentication for the shell; each page also calls requirePermission for its own section.
  const staff = await requireStaff()
  return (
    <div className="md:flex">
      <AdminNav staff={{ name: staff.name, email: staff.email, role: staff.role }} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  )
}
