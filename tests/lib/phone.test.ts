import { describe, it, expect } from 'vitest'
import { normalizeUzPhone, normalizeUzPhoneStrict } from '@/lib/phone'

describe('normalizeUzPhone', () => {
  it.each([
    ['+998 90 123-45-67', '+998901234567'],
    ['901234567', '+998901234567'],
    ['998901234567', '+998901234567'],
    ['+998901234567', '+998901234567'],
    ['(90) 123 45 67', '+998901234567'],
    ['  +998 (90) 123-45-67 ', '+998901234567'],
  ])('%s -> %s', (i, o) => expect(normalizeUzPhone(i)).toBe(o))

  it.each(['', '123', '90123456', '9012345678', '+1 415 555 2671', '+99890123456', '99890123456789', 'abc', '90 123 45 6a', '+998-90-123-45-67-8'])(
    'rejects %j',
    (i) => expect(normalizeUzPhone(i)).toBeNull(),
  )
})

describe('normalizeUzPhoneStrict (Telegram contact phones: full international number only)', () => {
  it.each([
    ['998901234567', '+998901234567'],
    ['+998901234567', '+998901234567'],
    ['+998 90 123 45 67', '+998901234567'],
  ])('%s -> %s', (i, o) => expect(normalizeUzPhoneStrict(i)).toBe(o))

  it.each(['298123456', '+376123456', '901234567', '+7 999 123 45 67', '99890123456', '9989012345678', '', 'abc', '+998-90-123-45-67', '++998901234567', '9+98901234567'])(
    'rejects %j',
    (i) => expect(normalizeUzPhoneStrict(i)).toBeNull(),
  )
})
