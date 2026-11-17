import Link from 'next/link'
import { getStaff } from '@/lib/admin/session'
import { homeFor, ROLE_LABELS } from '@/lib/permissions'

export const metadata = { title: 'No access' }

// Rendered (with HTTP 403) when requirePermission() calls forbidden() anywhere under /admin.
// Lives at the /admin segment because /admin has its own root layout (there is no app-wide root layout).
export default async function Forbidden() {
  const staff = await getStaff()
  const home = staff ? homeFor(staff.role) : '/admin/login'
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-neutral-500">403</p>
        <h1 className="mt-1 text-2xl font-bold text-neutral-900">No access to this page</h1>
        <p className="mt-2 text-sm text-neutral-600">
          {staff
            ? `Your account (${ROLE_LABELS[staff.role]}) does not have permission for this section. Ask a full admin if you need it.`
            : 'Sign in with an account that has access to this section.'}
        </p>
        <Link
          href={home}
          className="mt-5 inline-flex items-center justify-center rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
        >
          {staff ? 'Go to my start page' : 'Sign in'}
        </Link>
      </div>
    </main>
  )
}
