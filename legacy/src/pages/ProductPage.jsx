import React, { useState, useEffect } from 'react'
import {
  Star,
  Check,
  Shield,
  Truck,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  ArrowLeft,
  ChevronRight,
  Share2
} from 'lucide-react'
import { PRODUCTS } from '../data/products'

export default function ProductPage({
  productId,
  onBack,
  onAddToCart,
  onSelectProduct
}) {
  const product = PRODUCTS.find((p) => p.id === productId) || PRODUCTS[0]

  const [selectedColorIndex, setSelectedColorIndex] = useState(0)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [openAccordion, setOpenAccordion] = useState('specs')
  const [addedSuccess, setAddedSuccess] = useState(false)

  // Reset image and color when product changes
  useEffect(() => {
    setSelectedColorIndex(0)
    setSelectedImageIndex(0)
    setQuantity(1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [productId])

  const activeColor = product.colors[selectedColorIndex] || product.colors[0]
  const images = product.images

  const handleAddToCart = () => {
    onAddToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      selectedColor: activeColor.name,
      image: images[selectedImageIndex] || images[0]
    }, quantity)

    setAddedSuccess(true)
    setTimeout(() => setAddedSuccess(false), 2000)
  }

  // Related products
  const relatedProducts = PRODUCTS.filter((p) => p.id !== product.id).slice(0, 3)

  return (
    <div className="bg-white min-h-screen">
      {/* Breadcrumb Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 border-b border-neutral-100 flex items-center justify-between text-xs text-neutral-500">
        <div className="flex items-center space-x-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 hover:text-black transition cursor-pointer font-medium"
          >
            <ArrowLeft size={14} /> Back to Catalog
          </button>
          <span>/</span>
          <span>{product.category}</span>
          <span>/</span>
          <span className="text-neutral-900 font-semibold truncate max-w-[200px]">
            {product.name}
          </span>
        </div>

        <button
          onClick={() => {
            if (navigator.share) {
              navigator.share({ title: product.name, url: window.location.href })
            } else {
              navigator.clipboard.writeText(window.location.href)
              alert("Product link copied to clipboard!")
            }
          }}
          className="flex items-center gap-1.5 hover:text-black transition cursor-pointer"
        >
          <Share2 size={13} /> Share
        </button>
      </div>

      {/* Main Product Showcase Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
          {/* Left Column: Gallery (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col-reverse md:flex-row gap-4">
            {/* Thumbnail Navigation */}
            <div className="flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto md:max-h-[580px] shrink-0 pb-2 md:pb-0">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImageIndex(idx)}
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-neutral-100 p-1.5 transition-all shrink-0 cursor-pointer ${
                    selectedImageIndex === idx
                      ? "ring-2 ring-black ring-offset-2"
                      : "opacity-60 hover:opacity-100"
                  }`}
                >
                  <img
                    src={img}
                    alt={`${product.name} view ${idx + 1}`}
                    className="w-full h-full object-contain"
                  />
                </button>
              ))}
            </div>

            {/* Main Stage Image */}
            <div className="flex-1 aspect-square bg-[#f5f5f7] rounded-2xl overflow-hidden p-6 sm:p-10 flex items-center justify-center relative group">
              {product.badge && (
                <span className="absolute top-4 left-4 z-10 text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded bg-black text-white">
                  {product.badge}
                </span>
              )}

              <img
                src={images[selectedImageIndex] || images[0]}
                alt={product.name}
                className="w-full h-full object-contain object-center transition-transform duration-500 ease-out group-hover:scale-105"
              />

              {/* Prev/Next arrows for image gallery */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setSelectedImageIndex((selectedImageIndex - 1 + images.length) % images.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 hover:bg-white text-neutral-800 shadow-sm opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    aria-label="Previous image"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <button
                    onClick={() => setSelectedImageIndex((selectedImageIndex + 1) % images.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 hover:bg-white text-neutral-800 shadow-sm opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    aria-label="Next image"
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Right Column: Details & Purchasing (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              {/* Category & Rating */}
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-widest text-neutral-500 font-bold">
                  {product.category}
                </span>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800">
                  <div className="flex text-amber-400">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={13} className="fill-amber-400" />
                    ))}
                  </div>
                  <span>{product.rating}</span>
                  <span className="text-neutral-400">({product.reviewCount} reviews)</span>
                </div>
              </div>

              {/* Title & Tagline */}
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-neutral-900 tracking-tight leading-tight">
                  {product.name}
                </h1>
                <p className="text-sm font-medium text-neutral-600 mt-1">
                  {product.subName}
                </p>
              </div>

              {/* Pricing & Installments */}
              <div className="pt-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl sm:text-3xl font-extrabold text-neutral-950">
                    ${product.price}
                  </span>
                  {product.compareAtPrice && (
                    <span className="text-base text-neutral-400 line-through">
                      ${product.compareAtPrice}
                    </span>
                  )}
                  {product.compareAtPrice && (
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                      Save ${product.compareAtPrice - product.price}
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  or 4 interest-free payments of ${(product.price / 4).toFixed(2)} with Klarna
                </p>
              </div>

              {/* Description */}
              <p className="text-sm text-neutral-600 leading-relaxed pt-2">
                {product.description}
              </p>

              {/* Color Selector */}
              <div className="pt-4 border-t border-neutral-100">
                <div className="flex justify-between items-center text-xs mb-2.5">
                  <span className="font-bold uppercase tracking-wider text-neutral-700">
                    Color: <span className="font-semibold text-neutral-900">{activeColor.name}</span>
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  {product.colors.map((color, idx) => (
                    <button
                      key={color.id}
                      onClick={() => {
                        setSelectedColorIndex(idx)
                        if (images[color.imageIndex]) {
                          setSelectedImageIndex(color.imageIndex)
                        }
                      }}
                      className={`relative w-8 h-8 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                        selectedColorIndex === idx
                          ? "ring-2 ring-black ring-offset-2 scale-105"
                          : "opacity-80 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: color.hex }}
                      title={color.name}
                      aria-label={`Select ${color.name}`}
                    >
                      {selectedColorIndex === idx && (
                        <Check size={14} className={color.hex.toLowerCase() === '#ffffff' || color.hex.toLowerCase() === '#d8d9db' ? 'text-black' : 'text-white'} />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity & Add to Cart Controls */}
              <div className="pt-4 space-y-3">
                <div className="flex gap-3">
                  {/* Quantity selector */}
                  <div className="flex items-center border border-neutral-200 rounded-full px-3 py-2 bg-neutral-50">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="px-2 text-neutral-600 hover:text-black font-semibold cursor-pointer"
                    >
                      -
                    </button>
                    <span className="px-3 text-xs font-bold text-neutral-900">{quantity}</span>
                    <button
                      onClick={() => setQuantity(quantity + 1)}
                      className="px-2 text-neutral-600 hover:text-black font-semibold cursor-pointer"
                    >
                      +
                    </button>
                  </div>

                  {/* Add to Cart Button */}
                  <button
                    onClick={handleAddToCart}
                    className={`flex-1 py-3.5 px-6 rounded-full font-bold text-xs uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
                      addedSuccess
                        ? "bg-emerald-600 text-white"
                        : "bg-neutral-900 hover:bg-black text-white hover:shadow-xl"
                    }`}
                  >
                    {addedSuccess ? (
                      <>
                        <Check size={16} /> Added To Cart!
                      </>
                    ) : (
                      <>
                        <ShoppingBag size={16} /> Add to Cart • ${(product.price * quantity).toFixed(2)}
                      </>
                    )}
                  </button>
                </div>

                {/* Trust Badges */}
                <div className="grid grid-cols-3 gap-2 py-3 border-y border-neutral-100 text-center text-[11px] text-neutral-600">
                  <div className="flex flex-col items-center gap-1">
                    <Truck size={15} className="text-neutral-700" />
                    <span>Free Shipping &gt;$50</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Shield size={15} className="text-neutral-700" />
                    <span>2-Year Warranty</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <RotateCcw size={15} className="text-neutral-700" />
                    <span>30-Day Returns</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Accordions for Specs and Features */}
            <div className="border-t border-neutral-100 divide-y divide-neutral-100">
              {/* Key Features Accordion */}
              <div>
                <button
                  onClick={() => setOpenAccordion(openAccordion === 'features' ? '' : 'features')}
                  className="w-full py-3.5 flex justify-between items-center text-xs font-bold uppercase tracking-wider text-neutral-900 text-left cursor-pointer"
                >
                  <span>Key Features</span>
                  {openAccordion === 'features' ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {openAccordion === 'features' && (
                  <ul className="pb-4 space-y-2 text-xs text-neutral-600 animate-fade-in">
                    {product.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Technical Specifications Accordion */}
              <div>
                <button
                  onClick={() => setOpenAccordion(openAccordion === 'specs' ? '' : 'specs')}
                  className="w-full py-3.5 flex justify-between items-center text-xs font-bold uppercase tracking-wider text-neutral-900 text-left cursor-pointer"
                >
                  <span>Technical Specifications</span>
                  {openAccordion === 'specs' ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {openAccordion === 'specs' && (
                  <div className="pb-4 space-y-2 text-xs text-neutral-600 animate-fade-in">
                    {Object.entries(product.specs).map(([key, val]) => (
                      <div key={key} className="flex justify-between py-1 border-b border-neutral-50">
                        <span className="font-semibold text-neutral-800">{key}</span>
                        <span className="text-neutral-600 text-right max-w-[60%]">{val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Craftsmanship Accordion */}
              <div>
                <button
                  onClick={() => setOpenAccordion(openAccordion === 'craft' ? '' : 'craft')}
                  className="w-full py-3.5 flex justify-between items-center text-xs font-bold uppercase tracking-wider text-neutral-900 text-left cursor-pointer"
                >
                  <span>Craftsmanship & Materials</span>
                  {openAccordion === 'craft' ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {openAccordion === 'craft' && (
                  <div className="pb-4 text-xs text-neutral-600 space-y-2 animate-fade-in">
                    <p>
                      We build products that seamlessly combine high performance, minimalist aesthetics, and honest craftsmanship.
                    </p>
                    <p>
                      Whether using century-old vegetable-tanned leather from Chicago’s Horween Leather Co. or precision CNC-machined anodized aluminum, we never compromise on materials or durability.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Recommended Complementary Gear */}
      <section className="bg-neutral-50 py-16 border-t border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-end mb-8">
            <div>
              <span className="text-xs font-bold tracking-widest uppercase text-neutral-400">
                Complete Your Setup
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight">
                Recommended Accessories
              </h2>
            </div>
            <button
              onClick={onBack}
              className="text-xs font-semibold text-neutral-900 hover:text-blue-600 transition flex items-center gap-1 cursor-pointer"
            >
              View Full Collection <ChevronRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {relatedProducts.map((rel) => (
              <div
                key={rel.id}
                onClick={() => onSelectProduct(rel.id)}
                className="bg-white rounded-xl p-4 border border-neutral-200/60 hover:shadow-md transition cursor-pointer group flex flex-col justify-between"
              >
                <div className="aspect-square bg-neutral-100 rounded-lg overflow-hidden p-4 mb-3 flex items-center justify-center">
                  <img
                    src={rel.images[0]}
                    alt={rel.name}
                    className="w-full h-full object-contain group-hover:scale-105 transition duration-300"
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    {rel.category}
                  </span>
                  <h4 className="font-bold text-sm text-neutral-900 group-hover:text-blue-600 transition">
                    {rel.name}
                  </h4>
                  <p className="text-xs text-neutral-500 line-clamp-1">{rel.subName}</p>
                </div>
                <div className="mt-3 pt-2 border-t border-neutral-100 flex justify-between items-center">
                  <span className="font-bold text-sm text-neutral-950">${rel.price}</span>
                  <span className="text-xs font-semibold text-blue-600 group-hover:translate-x-0.5 transition flex items-center gap-0.5">
                    View Gear <ChevronRight size={12} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
