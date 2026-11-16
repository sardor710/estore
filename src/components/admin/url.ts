/** Client-side mirror of the server rule: image URLs must be absolute http(s). */
export function isHttpUrlClient(s: string): boolean {
  if (!/^https?:\/\//i.test(s)) return false
  try {
    const u = new URL(s)
    return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.hostname)
  } catch {
    return false
  }
}
