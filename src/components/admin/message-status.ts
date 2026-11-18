/** Badge tone per CustomerMessage.telegram status. */
export const TELEGRAM_TONE: Record<string, 'neutral' | 'green' | 'amber' | 'red'> = {
  pending: 'amber',
  sending: 'amber',
  sent: 'green',
  failed: 'red',
  skipped: 'neutral',
}
