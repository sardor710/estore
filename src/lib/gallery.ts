/** Index to show: `want` if it loaded fine, otherwise the next working image (wrapping); null when none work. */
export function visibleIndex(count: number, broken: ReadonlySet<number>, want: number): number | null {
  for (let k = 0; k < count; k++) {
    const i = (((want + k) % count) + count) % count
    if (!broken.has(i)) return i
  }
  return null
}

/** Neighbour of `from` among working images (dir = 1 next, -1 previous). */
export function stepIndex(count: number, broken: ReadonlySet<number>, from: number, dir: 1 | -1): number | null {
  for (let k = 1; k <= count; k++) {
    const i = (((from + dir * k) % count) + count) % count
    if (!broken.has(i)) return i
  }
  return null
}
