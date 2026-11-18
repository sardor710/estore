/** Attachment of a shop message (admin lists and the customer's Messages page). */
export default function MessageMedia({ url, kind, className = '' }: { url: string | null; kind: string | null; className?: string }) {
  if (!url) return null
  if (kind === 'video') {
    return <video src={url} controls playsInline preload="metadata" className={`max-h-[28rem] w-full rounded-xl bg-black ${className}`} />
  }
  // eslint-disable-next-line @next/next/no-img-element -- stored uploads are served as-is, any size
  return <img src={url} alt="" loading="lazy" className={`max-h-[28rem] w-auto max-w-full rounded-xl ${className}`} />
}
