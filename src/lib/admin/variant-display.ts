// Client-safe helpers that let staff recognise variants by picture instead of SKU.

/** The variant's own picture, else the product cover, else null. */
export function variantThumb(images: string[], imageIndex: number | null): string | null {
  if (imageIndex !== null && Number.isInteger(imageIndex) && imageIndex >= 0 && imageIndex < images.length) return images[imageIndex]
  return images[0] ?? null
}

/** After the image list changes, where the variant's picture now sits (first match); null if it was removed. */
export function remapImageIndex(before: string[], after: string[], index: number | null): number | null {
  if (index === null || !Number.isInteger(index) || index < 0 || index >= before.length) return null
  // One URL edited in place (same length, exactly one slot differs): positions did not move.
  if (before.length === after.length && before.filter((s, i) => s !== after[i]).length === 1) return index
  const at = after.indexOf(before[index])
  return at === -1 ? null : at
}
