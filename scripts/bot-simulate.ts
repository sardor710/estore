import 'dotenv/config'
import { prisma } from '../src/lib/db'
import { handleUpdate } from '../src/lib/telegram-bot/handler'
import { findPendingLogin } from '../src/lib/account/login'

// DEV / QA ONLY — never wire this into a route. Simulates the Telegram side of a website sign-in without a real
// Telegram client, by feeding fake updates straight into the same handleUpdate() the webhook and bot:poll use.
//
//   npx tsx scripts/bot-simulate.ts <deepLinkToken> <phone> <checkCode> [telegramUserId]
//
// <deepLinkToken> = the part after `login_` in the "Open Telegram" link on /{locale}/login
// <checkCode>     = the 4 digits shown big on that page (the button the user would tap)
// Steps: /start login_<token> -> own contact (phone) -> callback pick:<loginId>:<checkCode>. The login page's
// status poll should then flip to "done". Bot API calls are NOT sent: a fake fetch logs them and answers ok.
// Refuses to run with NODE_ENV=production.

function usage(): never {
  console.error('Usage: npx tsx scripts/bot-simulate.ts <deepLinkToken> <phone> <checkCode> [telegramUserId]')
  process.exit(2)
}

const fakeFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = url.split('/').pop()
  let body: unknown = init?.body
  try {
    body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
  } catch {
    // keep raw
  }
  console.log(`  [bot api] ${method}`, JSON.stringify(body))
  return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } })
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('bot-simulate is a development tool and does not run with NODE_ENV=production.')
    process.exit(1)
  }
  const [tokenArg, phone, checkCode, tgArg] = process.argv.slice(2)
  if (!tokenArg || !phone || !checkCode) usage()
  const token = tokenArg.replace(/^.*login_/, '') // also accepts the whole deep link
  if (!/^\d{4}$/.test(checkCode)) usage()
  const userIdNum = Number(tgArg ?? 900000001)
  if (!Number.isSafeInteger(userIdNum) || userIdNum <= 0) usage()
  const userId = String(userIdNum)

  const from = { id: userIdNum, is_bot: false, first_name: 'QA', last_name: 'Tester', language_code: 'en' }
  const chat = { id: userIdNum, type: 'private' }
  let updateId = Math.floor(Date.now() / 1000)

  console.log(`1) /start login_<token> as Telegram user ${userId}`)
  await handleUpdate({ update_id: updateId++, message: { message_id: 1, date: 0, from, chat, text: `/start login_${token}` } }, { fetchImpl: fakeFetch })

  console.log(`2) own contact ${phone}`)
  await handleUpdate(
    {
      update_id: updateId++,
      message: { message_id: 2, date: 0, from, chat, contact: { phone_number: phone, first_name: 'QA', last_name: 'Tester', user_id: userIdNum } },
    },
    { fetchImpl: fakeFetch },
  )

  const loginId = await findPendingLogin(userId)
  if (loginId === null) {
    console.error('No pending login bound to this Telegram user (expired token, wrong token, or refused contact).')
    process.exit(1)
  }

  console.log(`3) tap pick:${loginId}:${checkCode}`)
  await handleUpdate(
    {
      update_id: updateId++,
      callback_query: { id: `qa-${Date.now()}`, from, data: `pick:${loginId}:${checkCode}`, message: { message_id: 3, date: 0, chat } },
    },
    { fetchImpl: fakeFetch },
  )

  const row = await prisma.customerLogin.findUnique({ where: { id: loginId }, select: { status: true, customerId: true } })
  console.log(`Login ${loginId}: status ${row?.status}, customer ${row?.customerId ?? '-'} (CONFIRMED = the browser's next poll signs in)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
