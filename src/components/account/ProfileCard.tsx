import Link from 'next/link'
import { PencilLine, UserRound } from 'lucide-react'
import { formatPhone, initialOf } from './format'

/** Initial-letter avatar used by the header menu, the account sidebar and the profile page. */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initial = initialOf(name)
  const box = size === 'sm' ? 'h-7 w-7 text-xs' : size === 'md' ? 'h-11 w-11 text-base' : 'h-16 w-16 text-2xl'
  const icon = size === 'sm' ? 15 : size === 'md' ? 20 : 28
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neutral-700 to-neutral-950 font-bold text-white ring-2 ring-white ${box}`}
    >
      {initial ?? <UserRound size={icon} />}
    </span>
  )
}

/** Who is signed in: avatar, name (or phone), phone, and a link to edit the profile. */
export default function ProfileCard({ name, phone, editHref, editLabel }: { name: string; phone: string; editHref: string; editLabel: string }) {
  const shown = name.trim() || formatPhone(phone)
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-gradient-to-br from-neutral-50 to-white p-4 lg:flex-col lg:items-start lg:gap-3 lg:p-5">
      <Avatar name={name} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold text-neutral-900">{shown}</p>
        {name.trim() && <p className="truncate text-sm text-neutral-500">{formatPhone(phone)}</p>}
      </div>
      <Link
        href={editHref}
        title={editLabel}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 bg-white p-2.5 text-xs sm:px-3 sm:py-1.5 font-semibold text-neutral-800 transition hover:border-neutral-400"
      >
        <PencilLine size={13} aria-hidden />
        <span className="sr-only sm:not-sr-only lg:not-sr-only">{editLabel}</span>
      </Link>
    </div>
  )
}
