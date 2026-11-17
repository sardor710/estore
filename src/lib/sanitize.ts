import sanitize from 'sanitize-html'

const IMG_SRC = /^(https:\/\/|\/uploads\/)/i
const YOUTUBE_EMBED = /^https:\/\/(www\.youtube\.com|www\.youtube-nocookie\.com)\/embed\/[\w-]+(\?[\w=&%.-]*)?$/i

/** Allowlist sanitizer for admin/imported description HTML (server-side). */
export function sanitizeHtml(html: string): string {
  return sanitize(html, {
    allowedTags: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote',
      'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'span', 'div', 'iframe',
    ],
    allowedAttributes: {
      a: ['href', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      iframe: ['src', 'allowfullscreen', 'loading', 'referrerpolicy'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
    },
    // Alignment/layout is expressed only through these CKEditor classes (no inline styles).
    allowedClasses: {
      '*': ['text-align-*', 'image-style-*', 'image', 'image-inline', 'table', 'media'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['https'], iframe: ['https'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    exclusiveFilter: (f) => {
      if (f.tag === 'img') return !IMG_SRC.test(f.attribs.src ?? '')
      if (f.tag === 'iframe') return !YOUTUBE_EMBED.test(f.attribs.src ?? '')
      return false
    },
    transformTags: {
      a: sanitize.simpleTransform('a', { rel: 'noopener noreferrer' }),
      img: (tagName, attribs) => {
        const out = { ...attribs }
        for (const k of ['width', 'height']) if (k in out && !/^\d{1,5}$/.test(out[k])) delete out[k]
        return { tagName, attribs: out }
      },
      iframe: (tagName, attribs) => ({
        tagName,
        attribs: { src: attribs.src ?? '', allowfullscreen: 'allowfullscreen', loading: 'lazy', referrerpolicy: 'strict-origin-when-cross-origin' },
      }),
    },
  })
}
