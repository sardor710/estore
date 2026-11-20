'use client'

import { useState } from 'react'

/**
 * One full-width overview banner (imported from anker.com): optional heading + text above an edge-to-edge
 * picture, with the phone-sized image under 640px. A banner whose image fails to load disappears entirely.
 */
export default function OverviewBanner({ heading, body, image, imageMobile }: { heading: string; body: string; image: string; imageMobile?: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) return null
  // An image may already have failed before hydration attached onError.
  const checkLoaded = (el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth === 0) setBroken(true)
  }
  return (
    <section aria-label={heading || undefined} className="bg-white">
      {(heading || body) && (
        <div className="mx-auto max-w-4xl px-4 pb-6 pt-12 text-center sm:px-6 sm:pt-16">
          {heading && <h2 className="text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-4xl">{heading}</h2>}
          {body && <p className="mx-auto mt-3 max-w-2xl leading-relaxed text-neutral-600 sm:text-lg">{body}</p>}
        </div>
      )}
      <picture className="mx-auto block max-w-[1920px]">
        {imageMobile && <source media="(max-width: 639px)" srcSet={imageMobile} />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={heading} loading="lazy" decoding="async" className="block h-auto w-full" ref={checkLoaded} onError={() => setBroken(true)} />
      </picture>
    </section>
  )
}
