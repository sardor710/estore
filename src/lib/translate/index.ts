export { TranslationError, type Translator, type TargetLocale } from './types'
export { ClaudeTranslator, getTranslator, isTranslationConfigured } from './claude'
export { translateProduct, translateBlogPost, translateUiMissing, needsTranslation } from './apply'
