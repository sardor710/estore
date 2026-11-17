import { redirect } from 'next/navigation'
import { Store } from 'lucide-react'
import { getStaff } from '@/lib/admin/session'
import { isLoginConfigured } from '@/lib/admin/login'
import { homeFor } from '@/lib/permissions'
import LoginForm from '@/components/admin/LoginForm'

export const metadata = { title: 'Sign in' }

export default async function LoginPage() {
  const staff = await getStaff()
  if (staff) redirect(homeFor(staff.role))
  return (
    <main className="admin-ui flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <Store size={22} aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Admin sign in</h1>
          <p className="mt-1 text-sm text-neutral-600">Store management</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <LoginForm configured={await isLoginConfigured()} />
        </div>
      </div>
    </main>
  )
}
