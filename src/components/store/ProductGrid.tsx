import type { CardProduct } from '@/lib/catalog'
import type { Locale } from '@/i18n/routing'
import ProductCard from './ProductCard'

export default function ProductGrid({ products, locale }: { products: CardProduct[]; locale: Locale }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
      {products.map((p) => (
        <li key={p.id} className="flex">
          <div className="h-full w-full">
            <ProductCard product={p} locale={locale} />
          </div>
        </li>
      ))}
    </ul>
  )
}
