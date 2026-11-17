// Edge-safe (no DB, no Node APIs): imported by the proxy, server code and client components (nav filtering).

export const ROLES = ['ADMIN', 'PRODUCT_MANAGER', 'BLOG_EDITOR'] as const
export type Role = (typeof ROLES)[number]

export const PERMISSIONS = [
  'dashboard',
  'orders',
  'clients',
  'promotions',
  'catalog',
  'blog',
  'translations',
  'settings.business',
  'settings.integrations',
  'users',
  'activity',
  'banners',
] as const
export type Permission = (typeof PERMISSIONS)[number]

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Full admin',
  PRODUCT_MANAGER: 'Product manager',
  BLOG_EDITOR: 'Blog editor',
}

const PM_DENIED: ReadonlySet<Permission> = new Set(['users', 'activity', 'settings.integrations'])

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(PERMISSIONS),
  PRODUCT_MANAGER: new Set(PERMISSIONS.filter((p) => !PM_DENIED.has(p))),
  BLOG_EDITOR: new Set(['blog']),
}

export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v)
}

export function can(role: Role, p: Permission): boolean {
  return Object.hasOwn(MATRIX, role) ? MATRIX[role].has(p) : false
}

/** First path segment under /admin -> the permission that guards it. */
const SECTION: Record<string, Permission> = {
  orders: 'orders',
  clients: 'clients',
  promotions: 'promotions',
  products: 'catalog',
  categories: 'catalog',
  brands: 'catalog',
  import: 'catalog',
  blog: 'blog',
  translations: 'translations',
  users: 'users',
  activity: 'activity',
  settings: 'settings.business',
  banners: 'banners',
}

/** Permission required for an admin page path; null outside the guarded sections (e.g. /admin/login). */
export function permissionForPath(pathname: string): Permission | null {
  const m = /^\/admin(?:\/([^/]*))?/.exec(pathname)
  if (!m) return null
  const section = m[1] ?? ''
  if (section === '') return 'dashboard'
  return Object.hasOwn(SECTION, section) ? SECTION[section] : null
}

export function homeFor(role: Role): string {
  return role === 'BLOG_EDITOR' ? '/admin/blog' : '/admin'
}
