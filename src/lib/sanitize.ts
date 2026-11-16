import sanitize from 'sanitize-html'

/** Allowlist sanitizer for admin/imported description HTML (server-side). */
export function sanitizeHtml(html: string): string {
  return sanitize(html, {
    allowedTags: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'h4',
      'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div',
    ],
    allowedAttributes: { a: ['href', 'rel'], img: ['src', 'alt'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    exclusiveFilter: (f) => f.tag === 'img' && !/^https?:\/\//i.test(f.attribs.src ?? ''),
    transformTags: { a: sanitize.simpleTransform('a', { rel: 'noopener noreferrer' }) },
  })
}
