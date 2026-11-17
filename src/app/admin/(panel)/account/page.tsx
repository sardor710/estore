import { requireStaff } from '@/lib/admin/session'
import { ROLE_LABELS } from '@/lib/permissions'
import { PageHeader, card } from '@/components/admin/ui'
import AccountForm from '@/components/admin/AccountForm'

export const metadata = { title: 'My account' }

export default async function AccountPage() {
  // Every role may manage its own account: authentication is the only requirement.
  const staff = await requireStaff()
  return (
    <>
      <PageHeader title="My account" />
      <section className={`${card} mb-4`} aria-labelledby="me">
        <h2 id="me" className="mb-4 border-b border-neutral-100 pb-3 text-base font-semibold text-neutral-900">Profile</h2>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[8rem_1fr] sm:gap-y-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:pt-0.5">Name</dt>
          <dd className="mb-2 font-medium text-neutral-900 sm:mb-0">{staff.name}</dd>
          <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:pt-0.5">Email</dt>
          <dd className="mb-2 font-medium text-neutral-900 sm:mb-0">{staff.email}</dd>
          <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500 sm:pt-0.5">Role</dt>
          <dd className="mb-2 font-medium text-neutral-900 sm:mb-0">{ROLE_LABELS[staff.role]}</dd>
        </dl>
      </section>
      <AccountForm />
    </>
  )
}
