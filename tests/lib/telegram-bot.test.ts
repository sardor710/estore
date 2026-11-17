import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { updateSettings } from '@/lib/settings'
import { createSession, SESSION_COOKIE } from '@/lib/auth'
import { startLogin, collectLogin } from '@/lib/account/login'
import type { Role } from '@/lib/permissions'

// Server-action cookie jar (connectBotWebhookAction) — same pattern as tests/api/admin-actions-guard.test.ts.
const jar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { handleUpdate } = await import('@/lib/telegram-bot/handler')
const { POST: webhookPOST } = await import('@/app/api/telegram/webhook/route')
const { connectBotWebhookAction } = await import('@/app/admin/actions')

type Call = { method: string; body: Record<string, any> }

/** Fake Bot API: records every call; `fail` makes the given methods return an API error. */
function fakeTelegram(opts: { fail?: Record<string, string>; throws?: boolean } = {}) {
  const calls: Call[] = []
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (opts.throws) throw new Error('network down')
    const method = String(url).split('/').pop()!
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    calls.push({ method, body })
    if (opts.fail?.[method]) return Response.json({ ok: false, description: opts.fail[method] }, { status: 400 })
    const result = method === 'getMe' ? { id: 1, is_bot: true, username: 'shop_test_bot' } : method === 'sendMessage' ? { message_id: 77 } : true
    return Response.json({ ok: true, result })
  })
  const sent = () => calls.filter((c) => c.method === 'sendMessage' || c.method === 'editMessageText')
  const texts = () => sent().map((c) => String(c.body.text))
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch, sent, texts }
}

const NOW = new Date('2026-11-17T10:05:00Z') // 15:05 in Tashkent (UTC+5)
const ME = 5001
const OTHER = 6002

const from = (id: number, lang = 'en') => ({ id, is_bot: false, first_name: 'Ali', language_code: lang })
const chat = (id: number, type = 'private') => ({ id, type })
let updateId = 1
const textUpdate = (text: string, user = ME, lang = 'en', chatType = 'private') => ({
  update_id: updateId++,
  message: { message_id: updateId, date: 0, chat: chat(user, chatType), from: from(user, lang), text },
})
const contactUpdate = (c: { phone: string; user_id?: number; first_name?: string; last_name?: string }, user = ME, lang = 'en') => ({
  update_id: updateId++,
  message: {
    message_id: updateId,
    date: 0,
    chat: chat(user),
    from: from(user, lang),
    contact: { phone_number: c.phone, first_name: c.first_name ?? 'Ali', last_name: c.last_name, user_id: c.user_id },
  },
})
const callbackUpdate = (data: string, user = ME, lang = 'en') => ({
  update_id: updateId++,
  callback_query: {
    id: `cb${updateId}`,
    from: from(user, lang),
    data,
    message: { message_id: 77, date: 0, chat: chat(user) },
  },
})

/** Inline buttons of the confirm prompt (the last sendMessage carrying an inline keyboard). */
function promptOf(tg: ReturnType<typeof fakeTelegram>) {
  const msg = [...tg.sent()].reverse().find((c) => c.body.reply_markup?.inline_keyboard)
  if (!msg) throw new Error('no inline prompt sent')
  const buttons = (msg.body.reply_markup.inline_keyboard as { text: string; callback_data?: string }[][]).flat()
  return { text: String(msg.body.text), buttons }
}

/** Website start + bot /start + own contact share: returns the login and the prompt's buttons. */
async function signInUpToPrompt(tg: ReturnType<typeof fakeTelegram>, phone = '+998901234567', user = ME) {
  const login = await startLogin(NOW)
  await handleUpdate(textUpdate(`/start login_${login.token}`, user), { fetchImpl: tg.fetchImpl, now: NOW })
  await handleUpdate(contactUpdate({ phone, user_id: user }, user), { fetchImpl: tg.fetchImpl, now: NOW })
  return { login, ...promptOf(tg) }
}

const savedEnv = { ...process.env }
beforeEach(async () => {
  await updateSettings({ telegramBotToken: '111:TEST' })
  process.env.SITE_URL = 'https://shop.example.uz'
  process.env.SESSION_SECRET = 'z'.repeat(40)
  process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = 'true'
  jar.clear()
})
afterEach(() => {
  process.env = { ...savedEnv }
  vi.unstubAllGlobals()
})

describe('handleUpdate: first sign-in', () => {
  it('/start login_<token> from a new Telegram user asks to share the phone via a request_contact keyboard', async () => {
    const tg = fakeTelegram()
    const login = await startLogin(NOW)
    await handleUpdate(textUpdate(`/start login_${login.token}`), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(tg.sent()).toHaveLength(1)
    const m = tg.sent()[0].body
    expect(m.chat_id).toBe(String(ME))
    const kb = m.reply_markup.keyboard
    expect(kb[0][0]).toMatchObject({ request_contact: true, text: 'Share my phone number' })
    expect(m.reply_markup.one_time_keyboard).toBe(true)
    expect(m.text).not.toContain(login.checkCode)
  })

  it('own contact -> keyboard removed, confirm prompt with warning; real code only in the 6 buttons (2 rows of 3)', async () => {
    const tg = fakeTelegram()
    const { login, text, buttons } = await signInUpToPrompt(tg)
    expect(tg.sent().some((c) => c.body.reply_markup?.remove_keyboard === true)).toBe(true)
    expect(text).toContain('Only continue if YOU are signing in on the website right now')
    expect(text).toContain('Never confirm a link someone sent you')
    expect(text).toContain('Electronics Store')
    expect(text).not.toContain(login.checkCode)
    for (const t of tg.texts()) expect(t).not.toContain(login.checkCode)
    expect(buttons).toHaveLength(6)
    const codes = buttons.map((b) => b.text)
    expect(new Set(codes).size).toBe(6)
    expect(codes).toContain(login.checkCode)
    const rows = [...tg.sent()].reverse().find((c) => c.body.reply_markup?.inline_keyboard)!.body.reply_markup.inline_keyboard as unknown[][]
    expect(rows.map((r) => r.length)).toEqual([3, 3])
    const row = await prisma.customerLogin.findFirstOrThrow()
    for (const b of buttons) expect(b.callback_data).toBe(`pick:${row.id}:${b.text}`)
    const c = await prisma.customer.findUniqueOrThrow({ where: { phone: '+998901234567' } })
    expect(c).toMatchObject({ telegramUserId: String(ME), telegramChatId: String(ME), accountLocale: 'en' })
  })

  it('accepts a contact phone without the leading +', async () => {
    const tg = fakeTelegram()
    const { buttons } = await signInUpToPrompt(tg, '998901234567')
    expect(buttons).toHaveLength(6)
    expect(await prisma.customer.count({ where: { phone: '+998901234567' } })).toBe(1)
  })

  it('forwarded contact (someone else) -> refusal, no Customer created', async () => {
    const tg = fakeTelegram()
    const login = await startLogin(NOW)
    await handleUpdate(textUpdate(`/start login_${login.token}`), { fetchImpl: tg.fetchImpl, now: NOW })
    await handleUpdate(contactUpdate({ phone: '+998901234567', user_id: OTHER }), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(tg.texts().at(-1)).toContain('only share your own number')
    expect(await prisma.customer.count()).toBe(0)
  })

  it('contact card without a Telegram user id -> refusal, no Customer created', async () => {
    const tg = fakeTelegram()
    const login = await startLogin(NOW)
    await handleUpdate(textUpdate(`/start login_${login.token}`), { fetchImpl: tg.fetchImpl, now: NOW })
    await handleUpdate(contactUpdate({ phone: '+998901234567' }), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(tg.texts().at(-1)).toContain('only share your own number')
    expect(await prisma.customer.count()).toBe(0)
  })

  it('non-UZ number -> localized refusal with the keyboard removed', async () => {
    const tg = fakeTelegram()
    const login = await startLogin(NOW)
    await handleUpdate(textUpdate(`/start login_${login.token}`, ME, 'ru'), { fetchImpl: tg.fetchImpl, now: NOW })
    await handleUpdate(contactUpdate({ phone: '+79991234567', user_id: ME }, ME, 'ru'), { fetchImpl: tg.fetchImpl, now: NOW })
    const last = tg.sent().at(-1)!.body
    expect(last.text).toContain('+998')
    expect(last.text).toMatch(/[а-я]/)
    expect(last.reply_markup).toEqual({ remove_keyboard: true })
    expect(await prisma.customer.count()).toBe(0)
  })

  // Mini App "Share phone number" (requestContact) delivers a plain contact message with no website login pending.
  it('own contact with no sign-in pending -> account linked (tokenless) + "Phone linked" with an Open shop web_app button', async () => {
    const tg = fakeTelegram()
    await handleUpdate(contactUpdate({ phone: '+998901234567', user_id: ME }), { fetchImpl: tg.fetchImpl, now: NOW })
    const c = await prisma.customer.findUnique({ where: { phone: '+998901234567' } })
    expect(c).toMatchObject({ telegramUserId: String(ME), telegramChatId: String(ME), accountLocale: 'en' })
    expect(c?.accountCreatedAt).toEqual(NOW)
    const sent = tg.sent()
    expect(String(sent[0].body.text)).toContain('Phone number linked')
    expect(sent[0].body.reply_markup).toEqual({ remove_keyboard: true })
    expect(sent[1].body.reply_markup.inline_keyboard[0][0]).toEqual({
      text: '🛍 Open shop',
      web_app: { url: 'https://shop.example.uz/tg?next=%2Fen' },
    })
  })

  it('tokenless: someone else’s contact or a non-UZ number is refused, nothing linked', async () => {
    const tg = fakeTelegram()
    await handleUpdate(contactUpdate({ phone: '+998901234567', user_id: OTHER }), { fetchImpl: tg.fetchImpl, now: NOW })
    await handleUpdate(contactUpdate({ phone: '+77011234567', user_id: ME }), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(tg.texts()[0]).toContain('only share your own')
    expect(tg.texts()[1]).toContain('+998')
    expect(await prisma.customer.count()).toBe(0)
  })

  it('tokenless relink: the phone moves to the new Telegram user, the old account’s sessions die, old chat is told', async () => {
    const old = await prisma.customer.create({
      data: { phone: '+998901234567', name: 'A', region: '', tags: [], telegramUserId: String(OTHER), telegramChatId: String(OTHER), accountCreatedAt: NOW },
    })
    const tg = fakeTelegram()
    await handleUpdate(contactUpdate({ phone: '+998901234567', user_id: ME }), { fetchImpl: tg.fetchImpl, now: NOW })
    const after = await prisma.customer.findUnique({ where: { id: old.id } })
    expect(after).toMatchObject({ telegramUserId: String(ME), sessionVersion: old.sessionVersion + 1 })
    expect(tg.sent().some((c) => String(c.body.chat_id) === String(OTHER))).toBe(true)
  })

  it('a contact while a website sign-in is pending still goes down the sign-in flow (confirm prompt)', async () => {
    const tg = fakeTelegram()
    const { text, buttons } = await signInUpToPrompt(tg)
    expect(text).toContain('Tap the code you see')
    expect(buttons).toHaveLength(6)
    expect(tg.texts().some((t) => t.includes('Phone number linked'))).toBe(false)
  })

  it('expired / unknown token -> "link expired" with the site login link', async () => {
    const tg = fakeTelegram()
    await handleUpdate(textUpdate('/start login_nonexistenttoken'), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(tg.texts()[0]).toContain('This sign-in link has expired')
    expect(tg.texts()[0]).toContain('https://shop.example.uz/en/login')
  })

  it('a deep link already opened by another Telegram user -> expired for the second one', async () => {
    const tg = fakeTelegram()
    const login = await startLogin(NOW)
    await handleUpdate(textUpdate(`/start login_${login.token}`, ME), { fetchImpl: tg.fetchImpl, now: NOW })
    await handleUpdate(textUpdate(`/start login_${login.token}`, OTHER), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(tg.sent().at(-1)!.body.chat_id).toBe(String(OTHER))
    expect(tg.texts().at(-1)).toContain('This sign-in link has expired')
  })
})

describe('handleUpdate: confirm by picking the code', () => {
  it('correct pick -> website collects the customer once; "signed in" + "New sign-in ... Not you?" with signout_all', async () => {
    const tg = fakeTelegram()
    const { login, buttons } = await signInUpToPrompt(tg)
    const real = buttons.find((b) => b.text === login.checkCode)!
    await handleUpdate(callbackUpdate(real.callback_data!), { fetchImpl: tg.fetchImpl, now: NOW })

    expect(tg.calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true)
    const c = await prisma.customer.findUniqueOrThrow({ where: { phone: '+998901234567' } })
    expect(await collectLogin(login.token, login.browserSecret, NOW)).toEqual({ customerId: c.id })
    expect(tg.texts().some((t) => t.includes("You're signed in"))).toBe(true)
    const alert = tg.sent().find((m) => String(m.body.text).includes('New sign-in'))!
    expect(alert.body.text).toContain('15:05')
    expect(alert.body.text).toContain('Not you?')
    expect(alert.body.reply_markup.inline_keyboard.flat()).toEqual([{ text: 'Sign out everywhere', callback_data: 'signout_all' }])
  })

  it('wrong pick -> sign-in cancelled, website gets expired', async () => {
    const tg = fakeTelegram()
    const { login, buttons } = await signInUpToPrompt(tg)
    const decoy = buttons.find((b) => b.text !== login.checkCode)!
    await handleUpdate(callbackUpdate(decoy.callback_data!), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(tg.calls.some((c) => c.method === 'answerCallbackQuery')).toBe(true)
    expect(tg.texts().some((t) => t.includes("The codes didn't match"))).toBe(true)
    expect(tg.texts().some((t) => t.includes('New sign-in'))).toBe(false)
    expect(await collectLogin(login.token, login.browserSecret, NOW)).toBe('expired')
  })

  it('after a wrong pick: a new /start or a pick within 60 s -> "too many attempts, try again in a minute"', async () => {
    const tg = fakeTelegram()
    const first = await signInUpToPrompt(tg)
    const decoy = first.buttons.find((b) => b.text !== first.login.checkCode)!
    await handleUpdate(callbackUpdate(decoy.callback_data!), { fetchImpl: tg.fetchImpl, now: NOW })

    const soon = new Date(NOW.getTime() + 30_000)
    const tg2 = fakeTelegram()
    const login = await startLogin(soon)
    await handleUpdate(textUpdate(`/start login_${login.token}`), { fetchImpl: tg2.fetchImpl, now: soon })
    expect(tg2.texts()).toHaveLength(1)
    expect(tg2.texts()[0]).toContain('Too many attempts')
    expect(tg2.texts()[0]).toContain('in a minute')
    expect(tg2.sent()[0].body.reply_markup?.inline_keyboard).toBeUndefined()
    expect(await collectLogin(login.token, login.browserSecret, soon)).toBe('pending')

    const later = new Date(NOW.getTime() + 61_000)
    const tg3 = fakeTelegram()
    const again = await startLogin(later)
    await handleUpdate(textUpdate(`/start login_${again.token}`), { fetchImpl: tg3.fetchImpl, now: later })
    expect(promptOf(tg3).buttons.map((b) => b.text)).toContain(again.checkCode)
  })

  it('pick pressed by another Telegram user -> nothing confirmed, callback still answered', async () => {
    const tg = fakeTelegram()
    const { login, buttons } = await signInUpToPrompt(tg)
    const real = buttons.find((b) => b.text === login.checkCode)!
    await handleUpdate(callbackUpdate(real.callback_data!, OTHER), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(tg.calls.filter((c) => c.method === 'answerCallbackQuery')).toHaveLength(1)
    expect(await collectLogin(login.token, login.browserSecret, NOW)).toBe('pending')
    expect(tg.texts().some((t) => t.includes('New sign-in'))).toBe(false)
  })

  it('malformed callback data is answered and ignored', async () => {
    const tg = fakeTelegram()
    await handleUpdate(callbackUpdate('pick:abc:12'), { fetchImpl: tg.fetchImpl, now: NOW })
    await handleUpdate(callbackUpdate('whatever'), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(tg.calls.filter((c) => c.method === 'answerCallbackQuery')).toHaveLength(2)
    expect(tg.calls.filter((c) => c.method === 'sendMessage')).toHaveLength(0)
  })

  it('returning user: /start goes straight to the confirm prompt (no contact request)', async () => {
    const tg = fakeTelegram()
    const first = await signInUpToPrompt(tg)
    await handleUpdate(callbackUpdate(first.buttons.find((b) => b.text === first.login.checkCode)!.callback_data!), { fetchImpl: tg.fetchImpl, now: NOW })

    const tg2 = fakeTelegram()
    const login = await startLogin(NOW)
    await handleUpdate(textUpdate(`/start login_${login.token}`), { fetchImpl: tg2.fetchImpl, now: NOW })
    expect(tg2.sent().some((c) => c.body.reply_markup?.keyboard)).toBe(false)
    const { text, buttons } = promptOf(tg2)
    expect(text).not.toContain(login.checkCode)
    expect(buttons.map((b) => b.text)).toContain(login.checkCode)
    await handleUpdate(callbackUpdate(buttons.find((b) => b.text === login.checkCode)!.callback_data!), { fetchImpl: tg2.fetchImpl, now: NOW })
    expect(await collectLogin(login.token, login.browserSecret, NOW)).toMatchObject({ customerId: expect.any(Number) })
  })

  it('phone relinked from another Telegram account -> old chat is told it was disconnected', async () => {
    await prisma.customer.create({
      data: { phone: '+998901234567', name: 'Old', region: '', tags: [], telegramUserId: '999', telegramChatId: '999', accountCreatedAt: NOW },
    })
    const tg = fakeTelegram()
    await signInUpToPrompt(tg)
    const notice = tg.sent().find((c) => c.body.chat_id === '999')
    expect(notice?.body.text).toContain('disconnected')
  })
})

describe('handleUpdate: sign out everywhere', () => {
  it('signout_all bumps sessionVersion of the account linked to the sender only', async () => {
    const mine = await prisma.customer.create({
      data: { phone: '+998901111111', name: 'Me', region: '', tags: [], telegramUserId: String(ME), telegramChatId: String(ME), accountCreatedAt: NOW },
    })
    const theirs = await prisma.customer.create({
      data: { phone: '+998902222222', name: 'Them', region: '', tags: [], telegramUserId: String(OTHER), telegramChatId: String(OTHER), accountCreatedAt: NOW },
    })
    const tg = fakeTelegram()
    await handleUpdate(callbackUpdate('signout_all'), { fetchImpl: tg.fetchImpl, now: NOW })
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: mine.id } })).sessionVersion).toBe(1)
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: theirs.id } })).sessionVersion).toBe(0)
    const ans = tg.calls.find((c) => c.method === 'answerCallbackQuery')!
    expect(ans.body.text).toContain('Signed out on all devices')
  })
})

describe('handleUpdate: language, welcome, robustness', () => {
  it('ru language_code -> Russian copy (contact request)', async () => {
    const tg = fakeTelegram()
    const login = await startLogin(NOW)
    await handleUpdate(textUpdate(`/start login_${login.token}`, ME, 'ru-RU'), { fetchImpl: tg.fetchImpl, now: NOW })
    const m = tg.sent()[0].body
    expect(m.text).toMatch(/номер/)
    expect(m.reply_markup.keyboard[0][0].text).toBe('Отправить мой номер')
  })

  it('unknown/missing language -> Uzbek (default) confirm prompt with the uz shop name', async () => {
    const tg = fakeTelegram()
    const login = await startLogin(NOW)
    await handleUpdate(textUpdate(`/start login_${login.token}`, ME, 'de'), { fetchImpl: tg.fetchImpl, now: NOW })
    await handleUpdate(contactUpdate({ phone: '+998901234567', user_id: ME }, ME, 'de'), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(promptOf(tg).text).toContain('Elektronika doʻkoni')
  })

  it('plain /start and other text -> welcome with the shop link', async () => {
    const tg = fakeTelegram()
    await handleUpdate(textUpdate('/start'), { fetchImpl: tg.fetchImpl, now: NOW })
    await handleUpdate(textUpdate('hello'), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(tg.texts()).toHaveLength(2)
    for (const t of tg.texts()) expect(t).toContain('https://shop.example.uz/en')
  })

  it('welcome without SITE_URL has no link', async () => {
    delete process.env.SITE_URL
    const tg = fakeTelegram()
    await handleUpdate(textUpdate('/start'), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(tg.texts()[0]).not.toContain('http')
  })

  it('ignores group chats', async () => {
    const tg = fakeTelegram()
    const login = await startLogin(NOW)
    await handleUpdate(textUpdate(`/start login_${login.token}`, ME, 'en', 'group'), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(tg.calls).toHaveLength(0)
    expect((await prisma.customerLogin.findFirstOrThrow()).pendingTelegramUserId).toBeNull()
  })

  it('never throws: garbage updates and a dead network', async () => {
    const tg = fakeTelegram({ throws: true })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const u of [null, 42, 'x', {}, { message: null }, { message: { chat: {} } }, { callback_query: { data: 5 } }, textUpdate('/start')]) {
      await expect(handleUpdate(u, { fetchImpl: tg.fetchImpl, now: NOW })).resolves.toBeUndefined()
    }
    err.mockRestore()
  })
})

describe('POST /api/telegram/webhook', () => {
  const req = (body: unknown, secret?: string) =>
    new Request('https://shop.example.uz/api/telegram/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(secret !== undefined ? { 'x-telegram-bot-api-secret-token': secret } : {}) },
      body: JSON.stringify(body),
    })

  it('401 without a configured secret, without the header, or with a wrong one; handler not run', async () => {
    const tg = fakeTelegram()
    vi.stubGlobal('fetch', tg.fetchImpl)
    expect((await webhookPOST(req(textUpdate('/start'), ''))).status).toBe(401)
    await prisma.setting.create({ data: { key: 'telegramWebhookSecret', value: 'a'.repeat(64) } })
    expect((await webhookPOST(req(textUpdate('/start')))).status).toBe(401)
    expect((await webhookPOST(req(textUpdate('/start'), 'b'.repeat(64)))).status).toBe(401)
    expect(tg.calls).toHaveLength(0)
  })

  it('200 {ok:true} with the right secret and the update is handled', async () => {
    const tg = fakeTelegram()
    vi.stubGlobal('fetch', tg.fetchImpl)
    await prisma.setting.create({ data: { key: 'telegramWebhookSecret', value: 'a'.repeat(64) } })
    const res = await webhookPOST(req(textUpdate('/start'), 'a'.repeat(64)))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(tg.calls.filter((c) => c.method === 'sendMessage')).toHaveLength(1)
  })

  it('oversized body -> 413, not handled', async () => {
    const tg = fakeTelegram()
    vi.stubGlobal('fetch', tg.fetchImpl)
    await prisma.setting.create({ data: { key: 'telegramWebhookSecret', value: 'a'.repeat(64) } })
    const res = await webhookPOST(req({ ...textUpdate('/start'), pad: 'x'.repeat(40_000) }, 'a'.repeat(64)))
    expect(res.status).toBe(413)
    expect(tg.calls).toHaveLength(0)
  })
})

describe('connectBotWebhookAction', () => {
  let seq = 0
  async function signIn(role: Role) {
    const u = await prisma.adminUser.create({ data: { email: `bot-${++seq}@shop.uz`, name: role, role, active: true, passwordHash: 'x' } })
    jar.set(SESSION_COOKIE, await createSession({ uid: u.id, role, sv: u.sessionVersion }))
    return u
  }
  const FORBIDDEN = { digest: 'NEXT_HTTP_ERROR_FALLBACK;403' }

  it('forbidden for roles without settings.integrations; nothing sent', async () => {
    const tg = fakeTelegram()
    vi.stubGlobal('fetch', tg.fetchImpl)
    await signIn('PRODUCT_MANAGER')
    await expect(connectBotWebhookAction()).rejects.toMatchObject(FORBIDDEN)
    jar.clear()
    await signIn('BLOG_EDITOR')
    await expect(connectBotWebhookAction()).rejects.toMatchObject(FORBIDDEN)
    expect(tg.calls).toHaveLength(0)
    expect(await prisma.setting.count({ where: { key: 'telegramWebhookSecret' } })).toBe(0)
  })

  it('requires an https SITE_URL', async () => {
    const tg = fakeTelegram()
    vi.stubGlobal('fetch', tg.fetchImpl)
    await signIn('ADMIN')
    process.env.SITE_URL = 'http://localhost:3000'
    expect(await connectBotWebhookAction()).toEqual({ ok: false, error: 'SITE_URL must be an https URL reachable by Telegram' })
    delete process.env.SITE_URL
    expect(await connectBotWebhookAction()).toMatchObject({ ok: false })
    expect(tg.calls).toHaveLength(0)
  })

  it('calls setWebhook with the URL and a stored random secret (kept on reconnect); logs activity', async () => {
    const tg = fakeTelegram()
    vi.stubGlobal('fetch', tg.fetchImpl)
    const admin = await signIn('ADMIN')
    process.env.SITE_URL = 'https://shop.example.uz/'
    expect(await connectBotWebhookAction()).toEqual({ ok: true, username: 'shop_test_bot' })
    const secret = (await prisma.setting.findUniqueOrThrow({ where: { key: 'telegramWebhookSecret' } })).value
    expect(secret).toMatch(/^[0-9a-f]{64}$/)
    const call = tg.calls.find((c) => c.method === 'setWebhook')!
    expect(call.body).toEqual({
      url: 'https://shop.example.uz/api/telegram/webhook',
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    })
    await connectBotWebhookAction()
    expect((await prisma.setting.findUniqueOrThrow({ where: { key: 'telegramWebhookSecret' } })).value).toBe(secret)
    const log = await prisma.activityLog.findFirstOrThrow({ where: { entity: 'settings' } })
    expect(log.userId).toBe(admin.id)
  })

  it('Telegram error -> { ok:false, error } with the API description', async () => {
    const tg = fakeTelegram({ fail: { setWebhook: 'Bad Request: bad webhook: HTTPS url must be provided for webhook' } })
    vi.stubGlobal('fetch', tg.fetchImpl)
    await signIn('ADMIN')
    const r = await connectBotWebhookAction()
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('bad webhook') })
  })

  it('no bot token -> { ok:false } without calling Telegram', async () => {
    const tg = fakeTelegram()
    vi.stubGlobal('fetch', tg.fetchImpl)
    await prisma.setting.deleteMany({ where: { key: 'telegramBotToken' } })
    await signIn('ADMIN')
    expect(await connectBotWebhookAction()).toMatchObject({ ok: false, error: expect.stringContaining('bot token') })
    expect(tg.calls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------- Mini App: commands + location (T9)

describe('handleUpdate: Mini App commands and location', () => {
  const locUpdate = (latitude: number, longitude: number, user = ME) => ({
    update_id: updateId++,
    message: { message_id: updateId, date: 0, chat: chat(user), from: from(user), location: { latitude, longitude } },
  })
  async function linked(user = ME, phone = '+998901234567') {
    return prisma.customer.create({
      data: { phone, name: 'Ali', region: '', tags: [], telegramUserId: String(user), telegramChatId: String(user), accountLocale: 'en', accountCreatedAt: NOW },
    })
  }
  const keyboard = (c: { body: Record<string, any> }) => (c.body.reply_markup?.inline_keyboard ?? []).flat() as Record<string, any>[]

  it('/start and /help carry an Open shop web_app button', async () => {
    const tg = fakeTelegram()
    await handleUpdate(textUpdate('/start'), { fetchImpl: tg.fetchImpl, now: NOW })
    await handleUpdate(textUpdate('/help'), { fetchImpl: tg.fetchImpl, now: NOW })
    for (const c of tg.sent()) expect(keyboard(c)[0]).toEqual({ text: '🛍 Open shop', web_app: { url: 'https://shop.example.uz/tg?next=%2Fen' } })
  })

  it('/orders lists the last 5 orders of the linked account with an Open button each', async () => {
    const c = await linked()
    for (let i = 0; i < 6; i++) {
      await prisma.order.create({
        data: { number: 2001 + i, name: 'Ali', phone: c.phone, region: 'tashkent-city', address: 'x', locale: 'en', totalUzs: 100_000, status: i === 5 ? 'SHIPPING' : 'NEW' },
      })
    }
    await prisma.order.create({ data: { number: 3001, name: 'Z', phone: '+998935554433', region: 'tashkent-city', address: 'x', locale: 'en', totalUzs: 1 } })
    const tg = fakeTelegram()
    await handleUpdate(textUpdate('/orders'), { fetchImpl: tg.fetchImpl, now: NOW })
    const msg = tg.sent()[0]
    expect(String(msg.body.text)).toContain('#2006 · out for delivery · 100,000 UZS')
    expect(String(msg.body.text)).not.toContain('#2001')
    expect(String(msg.body.text)).not.toContain('#3001')
    const buttons = keyboard(msg)
    expect(buttons).toHaveLength(5)
    expect(buttons[0]).toEqual({ text: '#2006', web_app: { url: 'https://shop.example.uz/tg?next=%2Fen%2Faccount%2Forders%2F2006' } })
  })

  it('/orders without a linked account asks to share the phone in the shop', async () => {
    const tg = fakeTelegram()
    await handleUpdate(textUpdate('/orders'), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(tg.texts()[0]).toContain('Open the shop')
    expect(keyboard(tg.sent()[0])[0].web_app).toBeDefined()
  })

  it('location -> one button per saved address + "new address" web_app with the coordinates', async () => {
    const c = await linked()
    const a = await prisma.customerAddress.create({ data: { customerId: c.id, label: 'Home', recipient: 'Ali', region: 'tashkent-city', address: 'Amir Temur 1', isDefault: true } })
    const tg = fakeTelegram()
    await handleUpdate(locUpdate(41.3110814, 69.240562), { fetchImpl: tg.fetchImpl, now: NOW })
    const buttons = keyboard(tg.sent()[0])
    expect(buttons[0]).toEqual({ text: 'Home — Amir Temur 1', callback_data: `loc:${a.id}:41.311081:69.240562` })
    expect(Buffer.byteLength(buttons[0].callback_data)).toBeLessThanOrEqual(64)
    expect(buttons[1]).toEqual({
      text: '➕ New address',
      web_app: { url: 'https://shop.example.uz/tg?next=' + encodeURIComponent('/en/account/addresses?lat=41.311081&lng=69.240562') },
    })
  })

  it('tapping an address stores the pin on that address', async () => {
    const c = await linked()
    const a = await prisma.customerAddress.create({ data: { customerId: c.id, label: 'Home', recipient: 'Ali', region: 'tashkent-city', address: 'Amir Temur 1' } })
    const tg = fakeTelegram()
    await handleUpdate(callbackUpdate(`loc:${a.id}:41.311081:69.240562`), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(await prisma.customerAddress.findUnique({ where: { id: a.id } })).toMatchObject({ lat: 41.311081, lng: 69.240562 })
    expect(tg.calls.find((x) => x.method === 'answerCallbackQuery')?.body.text).toContain('Location saved')
  })

  it("another customer's address id or a bad pin -> nothing stored", async () => {
    await linked()
    const other = await linked(OTHER, '+998935554433')
    const theirs = await prisma.customerAddress.create({ data: { customerId: other.id, label: 'X', recipient: 'X', region: 'tashkent-city', address: 'Somewhere 1' } })
    const tg = fakeTelegram()
    await handleUpdate(callbackUpdate(`loc:${theirs.id}:41.311081:69.240562`), { fetchImpl: tg.fetchImpl, now: NOW })
    await handleUpdate(callbackUpdate(`loc:${theirs.id}:99.000000:69.240562`, OTHER), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(await prisma.customerAddress.findUnique({ where: { id: theirs.id } })).toMatchObject({ lat: null, lng: null })
    const answers = tg.calls.filter((x) => x.method === 'answerCallbackQuery').map((x) => String(x.body.text))
    expect(answers).toEqual([expect.stringContaining('Could not save'), expect.stringContaining('Could not save')])
  })

  it('location without a linked account -> share-phone hint + Open shop', async () => {
    const tg = fakeTelegram()
    await handleUpdate(locUpdate(41.3, 69.2), { fetchImpl: tg.fetchImpl, now: NOW })
    expect(tg.texts()[0]).toContain('Open the shop')
  })
})

describe('connectBotWebhook: Mini App menu button + commands (T10)', () => {
  it('sets the web_app menu button and commands in uz (default), ru and en', async () => {
    const { connectBotWebhook } = await import('@/lib/telegram-bot/webhook')
    const tg = fakeTelegram()
    const r = await connectBotWebhook(tg.fetchImpl)
    expect(r).toMatchObject({ ok: true, warnings: [] })
    expect(tg.calls.find((c) => c.method === 'setChatMenuButton')?.body).toEqual({
      menu_button: { type: 'web_app', text: '🛍 Shop', web_app: { url: 'https://shop.example.uz/tg?next=%2Fuz' } },
    })
    const cmds = tg.calls.filter((c) => c.method === 'setMyCommands')
    expect(cmds.map((c) => c.body.language_code ?? 'default')).toEqual(['default', 'ru', 'en'])
    expect(cmds[2].body.commands.map((c: { command: string }) => c.command)).toEqual(['start', 'orders', 'help'])
  })
  it('a menu/commands failure is reported as a warning but the webhook connect still succeeds', async () => {
    const { connectBotWebhook } = await import('@/lib/telegram-bot/webhook')
    const tg = fakeTelegram({ fail: { setChatMenuButton: 'Bad Request: nope' } })
    const r = await connectBotWebhook(tg.fetchImpl)
    expect(r.ok).toBe(true)
    expect((r as { warnings: string[] }).warnings[0]).toContain('nope')
  })
})
