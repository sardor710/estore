'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/admin/session'
import { logActivity } from '@/lib/admin/activity'
import {
  imageTranslationsFor,
  keepOriginalImage,
  queueProductImages,
  redoImageTranslation,
  type ImageTranslationRow,
} from '@/lib/image-translate/service'
import { IMAGE_LOCALES, type ImageLocale } from '@/lib/image-translate/prompt'

export type ImageTranslationsState = { urls: string[]; rows: ImageTranslationRow[]; configured: boolean }

const isLocale = (l: string): l is ImageLocale => (IMAGE_LOCALES as readonly string[]).includes(l)

/** Only images that belong to the product may be acted on. */
async function guard(productId: number, sourceUrl: string, locale: string) {
  const state = await imageTranslationsFor(productId)
  if (!isLocale(locale) || !state.urls.includes(sourceUrl)) throw new Error('Unknown image')
}

export async function imageTranslationsAction(productId: number): Promise<ImageTranslationsState> {
  await requirePermission('catalog')
  return imageTranslationsFor(productId)
}

export async function translateAllImagesAction(productId: number): Promise<ImageTranslationsState> {
  const staff = await requirePermission('catalog')
  const added = await queueProductImages(productId)
  if (added) await logActivity(staff, 'update', 'product', productId, `Queued ${added} image translation(s) for product #${productId}`)
  return imageTranslationsFor(productId)
}

export async function redoImageAction(productId: number, sourceUrl: string, locale: string, reread: boolean): Promise<ImageTranslationsState> {
  const staff = await requirePermission('catalog')
  await guard(productId, sourceUrl, locale)
  await redoImageTranslation(sourceUrl, locale as ImageLocale, { reread })
  await logActivity(staff, 'update', 'product', productId, `Redo ${locale} image translation for product #${productId}`)
  return imageTranslationsFor(productId)
}

export async function keepOriginalImageAction(productId: number, sourceUrl: string, locale: string): Promise<ImageTranslationsState> {
  const staff = await requirePermission('catalog')
  await guard(productId, sourceUrl, locale)
  await keepOriginalImage(sourceUrl, locale as ImageLocale)
  await logActivity(staff, 'update', 'product', productId, `Kept the original ${locale} image for product #${productId}`)
  revalidatePath('/', 'layout')
  return imageTranslationsFor(productId)
}
