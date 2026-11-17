import { redirect } from 'next/navigation'
import { getStaff } from '@/lib/admin/session'
import { isLoginConfigured } from '@/lib/admin/login'
import { homeFor } from '@/lib/permissions'
import LoginForm from '@/components/admin/LoginForm'

export const metadata = { title: 'Sign in' }

export default async function LoginPage() {
  const staff = await getStaff()
  if (staff) redirect(homeFor(staff.role))
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-2xl font-bold text-neutral-900">Admin sign in</h1>
        <p className="mb-5 text-sm text-neutral-500">Store management</p>
        <LoginForm configured={await isLoginConfigured()} />
      </div>
    </main>
  )
}
