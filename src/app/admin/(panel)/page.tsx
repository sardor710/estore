import { redirect } from 'next/navigation'
import { requireStaff } from '@/lib/admin/session'
import { can, homeFor } from '@/lib/permissions'

export default async function AdminHome() {
  const staff = await requireStaff()
  // Staff without the dashboard (blog editors) go to their own section instead of a 403.
  if (!can(staff.role, 'dashboard')) redirect(homeFor(staff.role))
  // The dashboard itself arrives in a later module; until then the order list is the landing page.
  redirect('/admin/orders')
}
