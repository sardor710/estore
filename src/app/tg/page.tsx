import { getBotUsername } from '@/lib/telegram-bot/api'
import TgLaunch from '@/components/tg/TgLaunch'

/** /tg?next=/ru/account/orders/1001 — every bot button enters the shop here (see src/lib/tg/next.ts). */
export default async function TgPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams
  const botUsername = await getBotUsername().catch(() => null)
  return <TgLaunch next={typeof next === 'string' ? next : null} botUsername={botUsername} />
}
