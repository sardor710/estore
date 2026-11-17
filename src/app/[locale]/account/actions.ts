'use server'

import { revalidatePath } from 'next/cache'
import { getAccountCustomer, clearCustomerCookie } from '@/lib/account/session'
import { isTelegramMode } from '@/lib/tg/mode'
import { updateProfile, deleteAccount, type ProfileInput } from '@/lib/account/profile'
import { saveAddress, deleteAddress, type AddressInput } from '@/lib/account/addresses'
import { toggleFavorite } from '@/lib/account/favorites'
import { buyAgain, type BuyAgainResult } from '@/lib/account/orders'

// Customer account mutations. Every action starts from the session (getAccountCustomer re-reads the DB row:
// deleted accounts / revoked sessions are signed out) and only ever passes the session's customer id / phone to
// the domain functions — ids from the client are looked up together with that owner. Next checks the Origin of
// server action POSTs (CSRF); the session cookie is SameSite=Lax.

type AuthError = { ok: false; error: 'AUTH' }
const AUTH: AuthError = { ok: false, error: 'AUTH' }

const revalidateAccount = () => revalidatePath('/[locale]/account', 'layout')

export async function updateProfileAction(input: ProfileInput): Promise<{ ok: true } | { ok: false; error: 'AUTH' | 'INVALID' | 'NOT_FOUND' }> {
  const c = await getAccountCustomer()
  if (!c) return AUTH
  const r = await updateProfile(c.id, input)
  if (r.ok) revalidateAccount()
  return r
}

export async function saveAddressAction(
  input: AddressInput,
): Promise<{ ok: true; id: number } | { ok: false; error: 'AUTH' | 'INVALID' | 'LIMIT' | 'NOT_FOUND' }> {
  const c = await getAccountCustomer()
  if (!c) return AUTH
  const r = await saveAddress(c.id, input)
  if (r.ok) revalidateAccount()
  return r
}

export async function deleteAddressAction(id: number): Promise<{ ok: true } | { ok: false; error: 'AUTH' | 'NOT_FOUND' }> {
  const c = await getAccountCustomer()
  if (!c) return AUTH
  if (!(await deleteAddress(c.id, id))) return { ok: false, error: 'NOT_FOUND' }
  revalidateAccount()
  return { ok: true }
}

/** Result `favorite` is the state after the call (false also when the product is not on the storefront). */
export async function toggleFavoriteAction(productId: number): Promise<{ ok: true; favorite: boolean } | AuthError> {
  const c = await getAccountCustomer()
  if (!c) return AUTH
  const favorite = await toggleFavorite(c.id, productId)
  revalidatePath('/[locale]/account/favorites', 'page')
  return { ok: true, favorite }
}

/** Lines for the cart (variantId + qty; the cart re-quotes prices) and snapshot names of lines no longer available. */
export async function buyAgainAction(orderNumber: number): Promise<({ ok: true } & BuyAgainResult) | { ok: false; error: 'AUTH' | 'NOT_FOUND' }> {
  const c = await getAccountCustomer()
  if (!c) return AUTH
  const r = await buyAgain(c.phone, orderNumber)
  if (!r) return { ok: false, error: 'NOT_FOUND' }
  return { ok: true, ...r }
}

/** Deletes the account (orders are kept) and signs this browser out. */
export async function deleteAccountAction(): Promise<{ ok: true } | { ok: false; error: 'AUTH' | 'NOT_FOUND' }> {
  const c = await getAccountCustomer()
  if (!c) return AUTH
  const done = await deleteAccount(c.id)
  await clearCustomerCookie(null, { telegram: await isTelegramMode() })
  if (!done) return { ok: false, error: 'NOT_FOUND' }
  revalidatePath('/[locale]', 'layout')
  return { ok: true }
}
