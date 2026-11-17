import { describe, it, expect } from 'vitest'
import { cleanLatLng, mapLinks } from '@/lib/geo'

describe('cleanLatLng', () => {
  it('accepts a valid pair', () => {
    expect(cleanLatLng(41.311081, 69.240562)).toEqual({ lat: 41.311081, lng: 69.240562 })
  })
  it('rounds to 6 decimals', () => {
    expect(cleanLatLng(41.3110814, 69.2405629)).toEqual({ lat: 41.311081, lng: 69.240563 })
  })
  it('treats both absent as no location', () => {
    expect(cleanLatLng(null, null)).toBeNull()
    expect(cleanLatLng(undefined, undefined)).toBeNull()
  })
  it.each([
    [41.3, undefined],
    [undefined, 69],
    ['41', 69],
    [NaN, 1],
    [Infinity, 1],
    [91, 0],
    [-91, 0],
    [0, 181],
    [0, -181],
  ])('rejects (%s, %s)', (lat, lng) => {
    expect(cleanLatLng(lat, lng)).toBe('INVALID')
  })
  it('accepts the range edges', () => {
    expect(cleanLatLng(-90, 180)).toEqual({ lat: -90, lng: 180 })
  })
})

describe('mapLinks', () => {
  it('builds Yandex (lng,lat) and Google (lat,lng) links', () => {
    expect(mapLinks(41.311081, 69.240562)).toEqual({
      yandex: 'https://yandex.com/maps/?pt=69.240562,41.311081&z=17&l=map',
      google: 'https://www.google.com/maps?q=41.311081,69.240562',
    })
  })
})
