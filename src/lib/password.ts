import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

// Server-only (node:crypto). Stored format: scrypt$N$r$p$saltB64$hashB64 — parameters travel with the hash
// so they can be raised later without invalidating existing passwords.
const N = 16384
const R = 8
const P = 1
const KEY_LEN = 32
const SALT_LEN = 16
// Upper bounds for parameters read back from the DB, so a corrupted row cannot make us burn CPU/memory.
const MAX_N = 1 << 20
const MAX_R = 32
const MAX_P = 16

function derive(password: string, salt: Buffer, keyLen: number, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keyLen, { N: n, r, p, maxmem: 256 * n * r + 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    )
  })
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(SALT_LEN)
  const hash = await derive(pw, salt, KEY_LEN, N, R, P)
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$')
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = typeof stored === 'string' ? stored.split('$') : []
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [n, r, p] = parts.slice(1, 4).map(Number)
  const salt = Buffer.from(parts[4], 'base64')
  const expected = Buffer.from(parts[5], 'base64')
  const validParams =
    Number.isInteger(n) && n > 1 && n <= MAX_N && (n & (n - 1)) === 0 &&
    Number.isInteger(r) && r >= 1 && r <= MAX_R &&
    Number.isInteger(p) && p >= 1 && p <= MAX_P
  if (!validParams || salt.length === 0 || expected.length < 16) return false
  try {
    const actual = await derive(typeof pw === 'string' ? pw : '', salt, expected.length, n, r, p)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
