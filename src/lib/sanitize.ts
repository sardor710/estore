/**
 * Minimal allowlist-free scrubber for admin/imported description HTML.
 * Removes dangerous elements, inline event handlers and javascript: URLs.
 * Not a full sanitizer: replace with a vetted library if untrusted authors are ever allowed.
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed|link|meta|form)\b[\s\S]*?(<\/\1\s*>|$)/gi, '')
    .replace(/<(script|style|iframe|object|embed|link|meta|form)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src|xlink:href|action|formaction)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi, '')
}
