import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { can, homeFor, permissionForPath, PERMISSIONS, ROLES, isRole } from '@/lib/permissions'

describe('can()', () => {
  it('matches the brief matrix', () => {
    expect(can('BLOG_EDITOR', 'catalog')).toBe(false)
    expect(can('BLOG_EDITOR', 'blog')).toBe(true)
    expect(can('PRODUCT_MANAGER', 'users')).toBe(false)
    expect(can('PRODUCT_MANAGER', 'settings.business')).toBe(true)
    expect(can('PRODUCT_MANAGER', 'settings.integrations')).toBe(false)
  })
  it('ADMIN has every permission; BLOG_EDITOR only blog; PM all but users/activity/integrations', () => {
    for (const p of PERMISSIONS) {
      expect(can('ADMIN', p), p).toBe(true)
      expect(can('BLOG_EDITOR', p), p).toBe(p === 'blog')
      expect(can('PRODUCT_MANAGER', p), p).toBe(!['users', 'activity', 'settings.integrations'].includes(p))
    }
  })
  it('unknown role (e.g. a stale or tampered value) has no permissions', () => {
    expect(can('ROOT' as never, 'blog')).toBe(false)
    expect(isRole('ROOT')).toBe(false)
    for (const r of ROLES) expect(isRole(r)).toBe(true)
  })
})

describe('permissionForPath()', () => {
  it.each([
    ['/admin', 'dashboard'],
    ['/admin/', 'dashboard'],
    ['/admin/products/5', 'catalog'],
    ['/admin/products', 'catalog'],
    ['/admin/categories', 'catalog'],
    ['/admin/brands', 'catalog'],
    ['/admin/import', 'catalog'],
    ['/admin/orders/3', 'orders'],
    ['/admin/clients', 'clients'],
    ['/admin/promotions/new', 'promotions'],
    ['/admin/blog', 'blog'],
    ['/admin/translations', 'translations'],
    ['/admin/users', 'users'],
    ['/admin/activity', 'activity'],
    ['/admin/settings', 'settings.business'],
  ])('%s -> %s', (path, perm) => {
    expect(permissionForPath(path)).toBe(perm)
  })
  it('no permission for login, unknown or look-alike paths', () => {
    expect(permissionForPath('/admin/login')).toBeNull()
    expect(permissionForPath('/admin/productsx')).toBeNull()
    expect(permissionForPath('/uz/products')).toBeNull()
  })
})

describe('homeFor()', () => {
  it('blog editors land on the blog, others on the dashboard', () => {
    expect(homeFor('BLOG_EDITOR')).toBe('/admin/blog')
    expect(homeFor('PRODUCT_MANAGER')).toBe('/admin')
    expect(homeFor('ADMIN')).toBe('/admin')
  })
})

// Pages are the authority (proxy only authenticates): every panel page must check the permission of its path.
describe('every (panel) page checks its permission', () => {
  const root = join('src', 'app', 'admin', '(panel)')
  const pages: string[] = []
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (f === 'page.tsx') pages.push(p)
    }
  }
  walk(root)
  const nested = pages.filter((p) => p !== join(root, 'page.tsx'))
  it('found the panel pages', () => {
    expect(nested.length).toBeGreaterThan(5)
  })
  it.each(nested)('%s', (file) => {
    const route = '/admin/' + relative(root, file).split(sep).slice(0, -1).join('/')
    const perm = permissionForPath(route)
    expect(perm, route).not.toBeNull()
    expect(readFileSync(file, 'utf8')).toContain(`requirePermission('${perm}')`)
  })
})
