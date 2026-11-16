import React, { useState } from 'react'
import { Plus, Check, Star } from 'lucide-react'

export default function ProductCard({ product, onSelectProduct, onQuickAdd }) {
  const [selectedColorIndex, setSelectedColorIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const [addedAnimation, setAddedAnimation] = useState(false)

  const activeColor = product.colors[selectedColorIndex] || product.colors[0]
  const mainImage = product.images[selectedColorIndex] || product.images[0]
  const hoverImage = product.images[1] || mainImage

  const handleQuickAddClick = (e) => {
    e.stopPropagation()
    onQuickAdd({
      id: product.id,
      name: product.name,
      price: product.price,
      selectedColor: activeColor.name,
      image: mainImage
    })
    setAddedAnimation(true)
    setTimeout(() => setAddedAnimation(false), 1200)
  }

  return (
    <div
      onClick={() => onSelectProduct(product.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group cursor-pointer flex flex-col bg-white rounded-xl transition-all duration-300 hover:shadow-md border border-neutral-100/80 p-3 sm:p-4"
    >
      {/* Product Image Stage */}
      <div className="relative aspect-square w-full bg-[#f6f6f7] rounded-lg overflow-hidden flex items-center justify-center p-4 transition-colors group-hover:bg-[#f0f0f2]">
        {/* Badge */}
        {product.badge && (
          <span className="absolute top-3 left-3 z-10 text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-black text-white">
            {product.badge}
          </span>
        )}

        {/* Rating pill */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-full text-[11px] font-semibold text-neutral-800 shadow-xs">
          <Star size={11} className="fill-amber-400 text-amber-400" />
          <span>{product.rating}</span>
        </div>

        {/* Product Image with Hover Flip */}
        <img
          src={isHovered ? hoverImage : mainImage}
          alt={`${product.name} in ${activeColor.name}`}
          className="w-full h-full object-contain object-center transform group-hover:scale-105 transition-all duration-500 ease-out"
          loading="lazy"
        />

        {/* Quick Add Button overlay */}
        <button
          onClick={handleQuickAddClick}
          className={`absolute bottom-3 right-3 z-20 p-2.5 rounded-full shadow-md transition-all duration-200 cursor-pointer ${
            addedAnimation
              ? "bg-emerald-600 text-white scale-110"
              : "bg-white text-neutral-900 hover:bg-black hover:text-white"
          }`}
          aria-label={`Add ${product.name} to cart`}
        >
          {addedAnimation ? <Check size={16} /> : <Plus size={16} />}
        </button>
      </div>

      {/* Product Info */}
      <div className="pt-4 flex flex-col flex-1 justify-between space-y-3">
        <div>
          {/* Color Swatches */}
          <div className="flex items-center space-x-1.5 pb-2">
            {product.colors.map((color, idx) => (
              <button
                key={color.id}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedColorIndex(idx)
                }}
                className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                  selectedColorIndex === idx
                    ? "ring-2 ring-black ring-offset-2 scale-110"
                    : "opacity-75 hover:opacity-100"
                }`}
                style={{ backgroundColor: color.hex }}
                title={color.name}
                aria-label={`Select ${color.name}`}
              />
            ))}
            <span className="text-[11px] text-neutral-400 ml-1 font-medium">
              {activeColor.name}
            </span>
          </div>

          <h3 className="font-bold text-sm sm:text-base text-neutral-900 group-hover:text-neutral-600 transition tracking-tight line-clamp-1">
            {product.name}
          </h3>
          <p className="text-xs text-neutral-500 font-normal line-clamp-1 mt-0.5">
            {product.subName}
          </p>
        </div>

        {/* Pricing */}
        <div className="flex items-baseline gap-2 pt-1 border-t border-neutral-100">
          <span className="font-semibold text-sm sm:text-base text-neutral-950">
            ${product.price}
          </span>
          {product.compareAtPrice && (
            <span className="text-xs text-neutral-400 line-through">
              ${product.compareAtPrice}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
