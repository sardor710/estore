import { describe, it, expect } from 'vitest'
import { REGIONS, getRegion } from '@/lib/regions'
import { locales } from '@/i18n/routing'

describe('regions', () => {
  it('has 14 unique regions with all three names', () => {
    expect(REGIONS).toHaveLength(14)
    expect(new Set(REGIONS.map((r) => r.code)).size).toBe(14)
    for (const r of REGIONS) for (const l of locales) expect(r.name[l]?.trim()).toBeTruthy()
  })
  it('looks up by code', () => {
    expect(getRegion('samarkand')?.name.en).toBe('Samarkand region')
    expect(getRegion('mars')).toBeUndefined()
  })
})
