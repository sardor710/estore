export type TargetLocale = 'uz' | 'ru'

export interface Translator {
  /** Returns exactly one translation per input string, in the same order. */
  translate(texts: string[], to: TargetLocale): Promise<string[]>
}

export class TranslationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'TranslationError'
  }
}
