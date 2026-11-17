import { requireStaff } from '@/lib/admin/session'
import { ROLE_LABELS } from '@/lib/permissions'
import { PageTitle, card } from '@/components/admin/ui'
import AccountForm from '@/components/admin/AccountForm'

export const metadata = { title: 'My account' }

export default async function AccountPage() {
  // Every role may manage its own account: authentication is the only requirement.
  const staff = await requireStaff()
  return (
    <>
      <PageTitle>My account</PageTitle>
      <section className={`${card} mb-4`} aria-labelledby="me">
        <h2 id="me" className="mb-3 font-bold">Profile</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-neutral-500">Name</dt>
          <dd className="text-neutral-900">{staff.name}</dd>
          <dt className="text-neutral-500">Email</dt>
          <dd className="text-neutral-900">{staff.email}</dd>
          <dt className="text-neutral-500">Role</dt>
          <dd className="text-neutral-900">{ROLE_LABELS[staff.role]}</dd>
        </dl>
      </section>
      <AccountForm />
    </>
  )
}
