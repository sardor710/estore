import { requirePermission } from '@/lib/admin/session'
import { listUsers } from '@/lib/admin/users'
import { PageTitle } from '@/components/admin/ui'
import UsersEditor from '@/components/admin/UsersEditor'

export const metadata = { title: 'Users' }

export default async function UsersPage() {
  const staff = await requirePermission('users')
  const users = await listUsers()
  return (
    <>
      <PageTitle>Users</PageTitle>
      <UsersEditor
        currentUserId={staff.id}
        users={users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          active: u.active,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        }))}
      />
    </>
  )
}
