'use client'

/**
 * "Fly to cart": a small copy of the product image travels from the clicked button to the visible cart icon
 * (any element marked `data-cart-target`: the header bag on the website, the cart tab in the Telegram Mini App),
 * then the icon pops. Uses the Web Animations API only. With reduced motion, or when no cart icon is on screen,
 * it resolves immediately (the toast and the badge count are the feedback then).
 */
const FLY_MS = 700
const SIZE = 56

function visibleTarget(): HTMLElement | null {
  const vw = window.innerWidth
  const vh = window.innerHeight
  for (const el of document.querySelectorAll<HTMLElement>('[data-cart-target]')) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw) return el
  }
  return null
}

function makeGhost(imageSrc?: string | null): HTMLElement {
  const ghost = document.createElement('div')
  ghost.setAttribute('aria-hidden', 'true')
  Object.assign(ghost.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    width: `${SIZE}px`,
    height: `${SIZE}px`,
    borderRadius: '9999px',
    overflow: 'hidden',
    zIndex: '9999',
    pointerEvents: 'none',
    background: imageSrc ? '#fff' : '#171717',
    boxShadow: '0 8px 24px rgba(0,0,0,.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } satisfies Partial<CSSStyleDeclaration>)
  if (imageSrc) {
    const img = document.createElement('img')
    img.src = imageSrc
    img.alt = ''
    Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'contain', padding: '6px' })
    ghost.appendChild(img)
  } else {
    // shopping-bag glyph (lucide "shopping-bag" path), white on black
    ghost.innerHTML =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/></svg>'
  }
  return ghost
}

export function bumpCartTarget(target: Element | null = typeof document === 'undefined' ? null : visibleTarget()) {
  if (!target || typeof (target as HTMLElement).animate !== 'function') return
  ;(target as HTMLElement).animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], {
    duration: 300,
    easing: 'ease-out',
  })
}

export async function flyToCart({ from, imageSrc }: { from: Element; imageSrc?: string | null }): Promise<void> {
  if (typeof window === 'undefined') return
  const target = visibleTarget()
  if (!target) return
  // reduced motion: no flight and no pop, the badge count change is the feedback
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || typeof document.body.animate !== 'function') return
  const a = from.getBoundingClientRect()
  const b = target.getBoundingClientRect()
  const x0 = a.left + a.width / 2 - SIZE / 2
  const y0 = a.top + a.height / 2 - SIZE / 2
  const x1 = b.left + b.width / 2 - SIZE / 2
  const y1 = b.top + b.height / 2 - SIZE / 2
  // a gentle arc: rise above the higher of the two points on the way
  const xm = (x0 + x1) / 2
  const ym = Math.min(y0, y1) - 80
  const ghost = makeGhost(imageSrc)
  document.body.appendChild(ghost)
  const anim = ghost.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1 },
      { transform: `translate(${xm}px, ${ym}px) scale(0.7)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${x1}px, ${y1}px) scale(0.3)`, opacity: 0.6 },
    ],
    { duration: FLY_MS, easing: 'cubic-bezier(.5,-0.2,.7,1)', fill: 'forwards' },
  )
  try {
    await anim.finished
  } catch {
    // cancelled (navigation): nothing to do
  } finally {
    ghost.remove()
  }
  bumpCartTarget(target)
}
