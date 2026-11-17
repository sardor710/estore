import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'

/** "Back to list" link shown above detail/edit page headers. */
export default function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <p className="mb-2 text-sm">
      <Link
        href={href}
        className="inline-flex items-center gap-1 rounded-md font-medium text-neutral-600 underline-offset-2 transition-colors hover:text-indigo-700 hover:underline"
      >
        <ChevronLeft size={16} aria-hidden />
        {children}
      </Link>
    </p>
  )
}
