// Legal pages (public offer, privacy policy, warranty & returns) as structured text per locale.
// Inline markup: [text](/legal/warranty) is a link inside the site; {seller} is the seller's legal name
// (Settings -> Shop details) or a generic fallback; {site} is zanko.uz; {bot} is the Telegram bot.

export const LEGAL_DOCS = ['offer', 'privacy', 'warranty'] as const
export type LegalDoc = (typeof LEGAL_DOCS)[number]

/** A paragraph, a bullet list, or the seller's contact details from Settings. */
export type Block = string | { ul: string[] } | { contacts: true }

export type LegalText = {
  title: string
  /** Meta description and the line under the title. */
  description: string
  sections: { h: string; blocks: Block[] }[]
}

export type LegalLabels = {
  updated: string
  sellerFallback: string
  contactsTitle: string
  name: string
  inn: string
  address: string
  phone: string
  email: string
  telegram: string
  hours: string
  notSet: string
  /** Footer heading for the legal links. */
  footer: string
  short: Record<LegalDoc, string>
}

export type LegalContent = { labels: LegalLabels } & Record<LegalDoc, LegalText>

export const LEGAL_UPDATED = '2026-11-18'
