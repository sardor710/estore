import { describe, expect, it } from 'vitest'
import { addressLine, parseGeocoderResponse, regionCode, type GeoComponent } from '@/lib/yandex-geocode'

// Shapes taken from real Yandex Geocoder 1.x answers.
const response = (pos: string, kind: string, text: string, components: GeoComponent[]) => ({
  response: {
    GeoObjectCollection: {
      featureMember: [{ GeoObject: { name: 'x', Point: { pos }, metaDataProperty: { GeocoderMetaData: { kind, text, Address: { Components: components } } } } }],
    },
  },
})

const tashkentCity = response('69.239375 41.311029', 'house', 'Uzbekistan, Tashkent, Shaykhantahur District, Beshagach, 1/1', [
  { kind: 'country', name: 'Uzbekistan' },
  { kind: 'province', name: 'Tashkent' },
  { kind: 'locality', name: 'Tashkent' },
  { kind: 'district', name: 'Shaykhantahur District' },
  { kind: 'street', name: 'Beshagach' },
  { kind: 'house', name: '1/1' },
])
const chirchiq = response('69.582065 41.46897', 'house', 'Узбекистан, Ташкентская область, Чирчик, проспект Алишера Навои, 291', [
  { kind: 'country', name: 'Узбекистан' },
  { kind: 'province', name: 'Ташкентская область' },
  { kind: 'area', name: 'Чирчик' },
  { kind: 'locality', name: 'Чирчик' },
  { kind: 'street', name: 'проспект Алишера Навои' },
  { kind: 'house', name: '291' },
])
const samarkandUz = response('66.9599 39.654418', 'house', 'Oʻzbekiston, Samarqand, Amir Temur koʻchasi, 18А', [
  { kind: 'country', name: 'Oʻzbekiston' },
  { kind: 'province', name: 'Samarqand viloyati' },
  { kind: 'area', name: 'Samarqand' },
  { kind: 'locality', name: 'Samarqand' },
  { kind: 'street', name: 'Amir Temur koʻchasi' },
  { kind: 'house', name: '18А' },
])

describe('parseGeocoderResponse', () => {
  it('reads the point (lng lat order in "pos"), kind and text', () => {
    const hit = parseGeocoderResponse(tashkentCity)!
    expect(hit.point).toEqual({ lat: 41.311029, lng: 69.239375 })
    expect(hit.kind).toBe('house')
    expect(hit.text).toContain('Beshagach')
  })
  it('returns null for empty or malformed answers', () => {
    expect(parseGeocoderResponse({ response: { GeoObjectCollection: { featureMember: [] } } })).toBeNull()
    expect(parseGeocoderResponse(null)).toBeNull()
    expect(parseGeocoderResponse(response('nope', 'house', '', []))).toBeNull()
  })
})

describe('addressLine', () => {
  it('keeps locality, district, street and house; drops country and province', () => {
    expect(addressLine(parseGeocoderResponse(tashkentCity)!)).toBe('Tashkent, Shaykhantahur District, Beshagach, 1/1')
    expect(addressLine(parseGeocoderResponse(chirchiq)!)).toBe('Чирчик, проспект Алишера Навои, 291')
  })
  it('falls back to the full text without the country', () => {
    const hit = parseGeocoderResponse(
      response('69 41', 'province', 'Uzbekistan, Tashkent Region', [
        { kind: 'country', name: 'Uzbekistan' },
        { kind: 'province', name: 'Tashkent Region' },
      ]),
    )!
    expect(addressLine(hit)).toBe('Tashkent Region')
  })
})

describe('regionCode', () => {
  it('tells Tashkent city from Tashkent region', () => {
    expect(regionCode(parseGeocoderResponse(tashkentCity)!)).toBe('tashkent-city')
    expect(regionCode(parseGeocoderResponse(chirchiq)!)).toBe('tashkent')
  })
  it('matches Uzbek and English province names', () => {
    expect(regionCode(parseGeocoderResponse(samarkandUz)!)).toBe('samarkand')
    const en = parseGeocoderResponse(response('71 40', 'province', '', [{ kind: 'province', name: 'Fergana Region' }]))!
    expect(regionCode(en)).toBe('fergana')
  })
  it('returns null outside the store regions', () => {
    const kz = parseGeocoderResponse(response('76 43', 'locality', '', [{ kind: 'province', name: 'Almaty' }]))!
    expect(regionCode(kz)).toBeNull()
  })
})
