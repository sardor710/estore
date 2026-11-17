import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/password'

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const h = await hashPassword('correct horse battery')
    expect(await verifyPassword('correct horse battery', h)).toBe(true)
    expect(await verifyPassword('correct horse batterY', h)).toBe(false)
    expect(await verifyPassword('', h)).toBe(false)
  })
  it('uses a random salt: two hashes of the same password differ', async () => {
    const [a, b] = await Promise.all([hashPassword('same password'), hashPassword('same password')])
    expect(a).not.toBe(b)
    expect(a).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/)
  })
  it('rejects malformed or foreign stored values instead of throwing', async () => {
    for (const s of ['', 'garbage', 'scrypt$1$1$1$$', 'bcrypt$2b$10$abc', 'scrypt$99999999999$8$1$AAAA$AAAA']) {
      expect(await verifyPassword('x', s), s).toBe(false)
    }
  })
})
