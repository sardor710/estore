import 'dotenv/config'
import { prisma } from '../src/lib/db'
import { botCall, botCallResult, getBotUsername } from '../src/lib/telegram-bot/api'
import { handleUpdate } from '../src/lib/telegram-bot/handler'

// Local development only: receive the shop bot's updates by long polling instead of the production webhook.
//   npm run bot:poll
// Uses the bot token saved in admin Settings (same database as `npm run dev`). Updates go through the same
// handleUpdate() as POST /api/telegram/webhook. Ctrl-C stops it.

let stopping = false

async function shutdown(code = 0): Promise<never> {
  stopping = true
  await prisma.$disconnect().catch(() => {})
  process.exit(code)
}

process.on('SIGINT', () => {
  console.log('\nStopped.')
  void shutdown(0)
})
process.on('SIGTERM', () => void shutdown(0))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Update = { update_id: number }

async function main() {
  const username = await getBotUsername()
  if (!username) {
    console.error('Bot not reachable: save a valid bot token in admin Settings -> Telegram first.')
    return shutdown(1)
  }
  console.log(`Bot: @${username}`)

  console.warn(
    'WARNING: this removes the bot webhook. If this bot token is also used in production, the live site stops\n' +
      'receiving bot updates until you click "Connect bot to website" in admin Settings again.',
  )
  const del = await botCallResult('deleteWebhook', { drop_pending_updates: false })
  if (!del.ok) {
    console.error(`deleteWebhook failed: ${del.error}`)
    return shutdown(1)
  }
  console.log('Polling for updates (Ctrl-C to stop)...')

  let offset = 0
  while (!stopping) {
    const updates = await botCall<Update[]>('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] })
    if (updates === null) {
      if (!stopping) console.error('getUpdates failed; retrying in 3 s')
      await sleep(3000)
      continue
    }
    for (const u of updates) {
      offset = Math.max(offset, u.update_id + 1)
      await handleUpdate(u) // never throws
    }
  }
}

main().catch(async (e) => {
  console.error(e)
  await shutdown(1)
})
