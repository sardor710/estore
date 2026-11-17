import { readJsonBody } from '@/lib/body-limit'
import { handleUpdate } from '@/lib/telegram-bot/handler'
import { isValidWebhookSecret, SECRET_HEADER } from '@/lib/telegram-bot/webhook'

export const dynamic = 'force-dynamic'

/**
 * Telegram Bot API webhook (registered by "Connect bot to website" in admin Settings). Telegram sends the secret
 * set at setWebhook in `x-telegram-bot-api-secret-token`; anything else is refused before the body is read.
 */
export async function POST(req: Request) {
  if (!(await isValidWebhookSecret(req.headers.get(SECRET_HEADER)))) {
    return Response.json({ ok: false }, { status: 401 })
  }
  const body = await readJsonBody(req)
  if (!body.ok) return Response.json({ ok: false }, { status: body.status })
  await handleUpdate(body.value) // never throws
  return Response.json({ ok: true })
}
