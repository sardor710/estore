import type { ReactNode } from 'react'
import { getNavCategories } from '@/lib/catalog'
import type { Locale } from '@/i18n/routing'
import Navbar from './Navbar'
import Footer from './Footer'

/** Header + footer chrome shared by every storefront page. */
export default async function StoreShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const categories = await getNavCategories()
  return (
    <>
      <Navbar locale={locale} categories={categories} />
      <main>{children}</main>
      <Footer locale={locale} categories={categories} />
    </>
  )
}
