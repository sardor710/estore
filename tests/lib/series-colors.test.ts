import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

// A value exported from a 'use client' file is only a reference on the server: a server component that reads
// SERIES_COLOR.x from such a file gets undefined, and the chart it hands the colour to renders black.
const SERVER_COMPONENTS = ['src/app/admin/(panel)/page.tsx', 'src/components/admin/dashboard/TrafficSection.tsx']

const isClientFile = (file: string) => /^\s*['"]use client['"]/.test(readFileSync(file, 'utf8'))

describe('chart colours reach server components as real values', () => {
  for (const file of SERVER_COMPONENTS) {
    it(`${file} takes SERIES_COLOR from a module without 'use client'`, () => {
      const src = readFileSync(file, 'utf8')
      expect(isClientFile(file)).toBe(false) // the premise: this file renders on the server
      const m = /import\s+(?:[\w$]+\s*,\s*)?\{[^}]*\bSERIES_COLOR\b[^}]*\}\s+from\s+'([^']+)'/.exec(src)
      expect(m, 'imports SERIES_COLOR').not.toBeNull()
      const spec = m![1]
      const base = spec.startsWith('@/') ? resolve('src', spec.slice(2)) : resolve(dirname(file), spec)
      const target = [`${base}.ts`, `${base}.tsx`].find((f) => {
        try {
          readFileSync(f)
          return true
        } catch {
          return false
        }
      })
      expect(target, `resolves ${spec}`).toBeDefined()
      expect(isClientFile(target!)).toBe(false)
    })
  }
  it('every series has a hex colour', async () => {
    const { SERIES_COLOR } = await import('@/components/admin/dashboard/series-colors')
    for (const k of ['revenue', 'orders', 'visitors', 'signedIn', 'guests', 'unknown'] as const) expect(SERIES_COLOR[k]).toMatch(/^#[0-9a-f]{6}$/)
  })
})
