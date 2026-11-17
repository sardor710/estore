import { createHash, randomInt } from 'node:crypto'
import { prisma } from '@/lib/db'
import { safeEqual } from '@/lib/auth'
import { normalizeUzPhone } from '@/lib/phone'
import { createSharedAwareLimiter } from '@/lib/rate-limit'

// "Later sign-ins": a 6-digit code sent by the bot to the chat already linked to the phone.
// Per-phone limits are counted from CustomerLoginCode rows (they survive restarts); the per-IP limit is in-memory.
// Callers MUST answer 'sent' and 'not_linked' identically (no account enumeration).

const MIN = 60_000
export const CODE_TTL_MS = 5 * MIN
export const CODE_MAX_ATTEMPTS = 5
const PHONE_WINDOW_MS = 15 * MIN
const PHONE_WINDOW_MAX = 3
const PHONE_DAY_MS = 24 * 60 * MIN
const PHONE_DAY_MAX = 10
/** Code rows older than this are deleted opportunistically (> the daily window). */
const CODE_RETENTION_MS = 2 * PHONE_DAY_MS

/** 10 requests/IP/15 min; the key 'shared' (no TRUST_PROXY: every client) gets its own larger cap. */
const ipLimiter = createSharedAwareLimiter({ windowMs: 15 * MIN, max: 10, sharedMax: 150 })

/** Tests only: clears the in-memory per-IP window (per-phone limits live in the DB). */
export function resetCodeLimits(): void {
  ipLimiter.reset()
}

const codeHash = (phone: string, code: string) => createHash('sha256').update(`${phone}:${code}`).digest('hex')

const TEXT: Record<string, (code: string) => string> = {
  uz: (c) => `Saytga kirish kodi: ${c}\nKod 5 daqiqa amal qiladi. Uni hech kimga aytmang.`,
  ru: (c) => `Код для входа на сайт: ${c}\nКод действует 5 минут. Никому его не сообщайте.`,
  en: (c) => `Your website sign-in code: ${c}\nValid for 5 minutes. Don't share it with anyone.`,
}

/**
 * Limits are checked and the code row is issued before returning. With `opts.schedule` (the API route passes
 * runAfterResponse) the Telegram send runs in the scheduled task and the result is 'sent' once the code is issued
 * (a failed send still burns the code there); without it the send is awaited and may yield 'send_failed'.
 */
export async function requestLoginCode(
  phone: string,
  ipKey: string,
  send: (chatId: string, text: string) => Promise<boolean>,
  now: Date = new Date(),
  opts: { schedule?: (task: () => Promise<unknown>) => void } = {},
): Promise<'sent' | 'not_linked' | 'bad_phone' | 'rate_limited' | 'phone_limited' | 'send_failed'> {
  if (ipLimiter.reserve(ipKey || 'shared', now.getTime()) === null) return 'rate_limited'
  const p = normalizeUzPhone(phone)
  if (!p) return 'bad_phone'
  const c = await prisma.customer.findUnique({
    where: { phone: p },
    select: { telegramChatId: true, accountCreatedAt: true, accountLocale: true },
  })
  if (!c || !c.accountCreatedAt || !c.telegramChatId) return 'not_linked'
  const chatId = c.telegramChatId

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const issued = await prisma.$transaction(async (tx) => {
    await tx.customerLoginCode.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - CODE_RETENTION_MS) } } })
    const [recent, today] = await Promise.all([
      tx.customerLoginCode.count({ where: { phone: p, createdAt: { gt: new Date(now.getTime() - PHONE_WINDOW_MS) } } }),
      tx.customerLoginCode.count({ where: { phone: p, createdAt: { gt: new Date(now.getTime() - PHONE_DAY_MS) } } }),
    ])
    if (recent >= PHONE_WINDOW_MAX || today >= PHONE_DAY_MAX) return null
    // only the newest code is valid
    await tx.customerLoginCode.updateMany({ where: { phone: p, usedAt: null }, data: { usedAt: now } })
    return tx.customerLoginCode.create({
      data: { phone: p, codeHash: codeHash(p, code), expiresAt: new Date(now.getTime() + CODE_TTL_MS), createdAt: now },
      select: { id: true },
    })
  })
  // Per-phone limits only exist for linked phones: callers must answer this like 'sent'/'not_linked' (no 429),
  // otherwise a 4th request would reveal that the phone has an account.
  if (!issued) return 'phone_limited'

  const deliver = async (): Promise<boolean> => {
    let ok = false
    try {
      ok = (await send(chatId, (TEXT[c.accountLocale ?? ''] ?? TEXT.uz)(code))) === true
    } catch {
      ok = false
    }
    if (!ok) {
      // the row still counts towards the limits, but the code can never be used
      await prisma.customerLoginCode.update({ where: { id: issued.id }, data: { usedAt: now } })
    }
    return ok
  }
  if (opts.schedule) {
    opts.schedule(deliver)
    return 'sent'
  }
  return (await deliver()) ? 'sent' : 'send_failed'
}

export async function verifyLoginCode(
  phone: string,
  code: string,
  now: Date = new Date(),
): Promise<{ customerId: number } | 'invalid' | 'expired' | 'too_many_attempts'> {
  const p = normalizeUzPhone(phone)
  if (!p || typeof code !== 'string' || !/^\d{6}$/.test(code)) return 'invalid'
  const row = await prisma.customerLoginCode.findFirst({
    where: { phone: p, usedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  if (!row) return 'invalid'
  if (row.expiresAt <= now) return 'expired'
  if (row.attempts >= CODE_MAX_ATTEMPTS) return 'too_many_attempts'
  // count the attempt before comparing, atomically, so parallel guesses cannot exceed the limit
  const counted = await prisma.customerLoginCode.updateMany({
    where: { id: row.id, usedAt: null, attempts: { lt: CODE_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  })
  if (counted.count !== 1) return 'too_many_attempts'
  if (!(await safeEqual(codeHash(p, code), row.codeHash))) {
    return row.attempts + 1 >= CODE_MAX_ATTEMPTS ? 'too_many_attempts' : 'invalid'
  }
  const used = await prisma.customerLoginCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } })
  if (used.count !== 1) return 'invalid'
  const c = await prisma.customer.findUnique({ where: { phone: p }, select: { id: true, accountCreatedAt: true } })
  if (!c || !c.accountCreatedAt) return 'invalid'
  return { customerId: c.id }
}
