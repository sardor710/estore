import { notifyOrderPaid, sendTelegramText } from '@/lib/telegram'
import type { PaymentDeps } from './service'

/** Production side effects for the payment service: the shop's Telegram chat. */
export const livePaymentDeps: PaymentDeps = {
  notifyPaid: (orderId) => notifyOrderPaid(orderId),
  alert: (text) => sendTelegramText(text),
}
