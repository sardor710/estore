import { describe, it, expect } from 'vitest'
import { verifyInitData } from '@/lib/tg/init-data'
import { signInitData, tgUser, nowSec } from '../fixtures/tg'

const TOKEN = '123456:TEST-token'
const now = new Date('2026-11-17T12:00:00Z')

describe('verifyInitData', () => {
  it('accepts a correctly signed payload', () => {
    const raw = signInitData(tgUser(777, { languageCode: 'ru', authDate: nowSec(now) - 60 }), TOKEN)
    expect(verifyInitData(raw, TOKEN, { now })).toEqual({
      userId: '777',
      firstName: 'Aziz',
      languageCode: 'ru',
      authDate: new Date((nowSec(now) - 60) * 1000),
    })
  })
  it('rejects a tampered user', () => {
    const raw = signInitData(tgUser(777, { authDate: nowSec(now) }), TOKEN)
    const forged = raw.replace(encodeURIComponent('"id":777'), encodeURIComponent('"id":778'))
    expect(forged).not.toBe(raw)
    expect(verifyInitData(forged, TOKEN, { now })).toBeNull()
  })
  it('rejects a payload signed by another bot', () => {
    const raw = signInitData(tgUser(777, { authDate: nowSec(now) }), '999:OTHER')
    expect(verifyInitData(raw, TOKEN, { now })).toBeNull()
  })
  it('rejects a missing hash', () => {
    const raw = new URLSearchParams(signInitData(tgUser(777, { authDate: nowSec(now) }), TOKEN))
    raw.delete('hash')
    expect(verifyInitData(raw.toString(), TOKEN, { now })).toBeNull()
  })
  it('rejects a missing user or a non-numeric id', () => {
    expect(verifyInitData(signInitData({ auth_date: String(nowSec(now)) }, TOKEN), TOKEN, { now })).toBeNull()
    const bad = { ...tgUser(1, { authDate: nowSec(now) }), user: { id: 'abc', first_name: 'X' } }
    expect(verifyInitData(signInitData(bad, TOKEN), TOKEN, { now })).toBeNull()
  })
  it('rejects auth_date older than 24 h and one far in the future', () => {
    expect(verifyInitData(signInitData(tgUser(1, { authDate: nowSec(now) - 86401 }), TOKEN), TOKEN, { now })).toBeNull()
    expect(verifyInitData(signInitData(tgUser(1, { authDate: nowSec(now) + 120 }), TOKEN), TOKEN, { now })).toBeNull()
    expect(verifyInitData(signInitData(tgUser(1, { authDate: nowSec(now) - 86399 }), TOKEN), TOKEN, { now })).not.toBeNull()
  })
  it('rejects empty input and an empty token', () => {
    expect(verifyInitData('', TOKEN, { now })).toBeNull()
    expect(verifyInitData(signInitData(tgUser(1, { authDate: nowSec(now) }), ''), '', { now })).toBeNull()
  })
  it('a missing language_code becomes null', () => {
    const f = { ...tgUser(5, { authDate: nowSec(now) }), user: { id: 5, first_name: 'B' } }
    expect(verifyInitData(signInitData(f, TOKEN), TOKEN, { now })?.languageCode).toBeNull()
  })
})
