import React, { useState } from 'react'
import Navbar from './components/Navbar'
import HeroBanner from './components/HeroBanner'
import ProductCard from './components/ProductCard'
import ProductPage from './pages/ProductPage'
import CartDrawer from './components/CartDrawer'
import Footer from './components/Footer'
import { PRODUCTS } from './data/products'
import { addToCart, updateQuantity, removeFromCart, filterProducts } from './utils/cart'
import { Shield, Sparkles, Award, ArrowRight, Check } from 'lucide-react'

export default function App() {
  const [activeCategory, setActiveCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState(null)
  const [toastMessage, setToastMessage] = useState(null)

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const handleAddToCart = (productItem, qty = 1) => {
    setCart((prev) => addToCart(prev, productItem, qty))
    setCartOpen(true)
    showToast(`Added ${productItem.name} (${productItem.selectedColor}) to your cart!`)
  }

  const handleUpdateQuantity = (id, color, qty) => {
    setCart((prev) => updateQuantity(prev, id, color, qty))
  }

  const handleRemoveItem = (id, color) => {
    setCart((prev) => removeFromCart(prev, id, color))
    showToast('Item removed from cart.')
  }

  const handleSelectProduct = (id) => {
    setSelectedProductId(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleBackToHome = () => {
    setSelectedProductId(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Filtered products list
  const filteredProducts = filterProducts(PRODUCTS, activeCategory, searchQuery)

  const cartTotalItems = cart.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <div className="min-h-screen flex flex-col bg-white text-neutral-900 font-sans selection:bg-neutral-900 selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-neutral-900 text-white text-xs px-4 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-fade-in border border-neutral-700">
          <Check size={14} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Navigation */}
      <Navbar
        cartCount={cartTotalItems}
        onOpenCart={() => setCartOpen(true)}
        activeCategory={activeCategory}
        onSelectCategory={(cat) => {
          setActiveCategory(cat)
          setSelectedProductId(null)
        }}
        onSearch={setSearchQuery}
        searchQuery={searchQuery}
        onOpenProduct={handleSelectProduct}
      />

      {/* Main Content: Either Product Detail Page OR Home / Storefront */}
      <div className="flex-1">
        {selectedProductId ? (
          <ProductPage
            productId={selectedProductId}
            onBack={handleBackToHome}
            onAddToCart={handleAddToCart}
            onSelectProduct={handleSelectProduct}
          />
        ) : (
          <div>
            {/* Hero Carousel (Shown on 'All' category and no search) */}
            {!searchQuery && activeCategory === 'All' && (
              <HeroBanner onSelectProduct={handleSelectProduct} />
            )}

            {/* Catalog Section */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
              {/* Category Pills & Section Header */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">
                    {activeCategory === 'All' ? 'Complete Collection' : activeCategory}
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-neutral-950 tracking-tight">
                    {searchQuery ? `Search Results for "${searchQuery}"` : activeCategory === 'All' ? 'Essential Everyday Gear' : `${activeCategory} Collection`}
                  </h2>
                </div>

                {/* Filter Pills */}
                <div className="flex flex-wrap items-center gap-2">
                  {['All', 'Charging', 'Cases', 'Watch', 'Tracking & Wallets'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`text-xs px-4 py-2 rounded-full font-medium transition cursor-pointer ${
                        activeCategory === cat
                          ? "bg-neutral-900 text-white shadow-xs"
                          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Product Grid */}
              {filteredProducts.length === 0 ? (
                <div className="py-20 text-center space-y-3 bg-neutral-50 rounded-2xl p-8 border border-neutral-100">
                  <p className="text-base font-semibold text-neutral-800">No products match your criteria</p>
                  <p className="text-xs text-neutral-500">Try adjusting your category filter or search terms.</p>
                  <button
                    onClick={() => {
                      setActiveCategory('All')
                      setSearchQuery('')
                    }}
                    className="mt-2 text-xs font-semibold px-4 py-2 bg-neutral-900 text-white rounded-full hover:bg-black transition cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onSelectProduct={handleSelectProduct}
                      onQuickAdd={handleAddToCart}
                    />
                  ))}
                </div>
              )}

              {/* Craftsmanship Story Banner */}
              <section className="mt-20 rounded-3xl overflow-hidden bg-neutral-900 text-white p-8 sm:p-14 relative flex flex-col md:flex-row items-center justify-between gap-10">
                <div className="max-w-xl space-y-4 z-10">
                  <span className="text-xs font-bold tracking-widest uppercase text-amber-500 flex items-center gap-1.5">
                    <Sparkles size={14} /> Our Craft Philosophy
                  </span>
                  <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                    Crafted for the Journey, Built to Endure
                  </h3>
                  <p className="text-neutral-400 text-xs sm:text-sm leading-relaxed">
                    We partner with legendary suppliers like Chicago’s Horween Leather Co., utilize aerospace-grade aluminum, and design custom FKM fluoroelastomers to ensure every piece in your daily carry withstands real-world adventures.
                  </p>
                  <div className="pt-2 flex flex-wrap gap-4 text-xs font-semibold">
                    <span className="flex items-center gap-1 text-neutral-300">
                      <Award size={16} className="text-amber-400" /> Horween® Chicago Tannery
                    </span>
                    <span className="flex items-center gap-1 text-neutral-300">
                      <Shield size={16} className="text-blue-400" /> Official MagSafe 15W
                    </span>
                  </div>
                </div>

                <div className="w-full md:w-auto shrink-0 z-10">
                  <button
                    onClick={() => setActiveCategory('Cases')}
                    className="w-full md:w-auto px-7 py-4 bg-white hover:bg-neutral-100 text-black font-bold text-xs uppercase tracking-wider rounded-full transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                  >
                    Explore Horween Leather <ArrowRight size={15} />
                  </button>
                </div>

                {/* Subtle dark gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-800 opacity-90" />
              </section>
            </main>
          </div>
        )}
      </div>

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onSelectProduct={handleSelectProduct}
      />

      {/* Global Footer */}
      <Footer onSelectCategory={setActiveCategory} />
    </div>
  )
}
