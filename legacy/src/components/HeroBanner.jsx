import React, { useState, useEffect } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { HERO_BANNERS } from '../data/products'

export default function HeroBanner({ onSelectProduct }) {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % HERO_BANNERS.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [])

  const current = HERO_BANNERS[currentIndex]

  return (
    <div className="relative w-full h-[580px] sm:h-[640px] lg:h-[720px] bg-neutral-950 overflow-hidden select-none group">
      {/* Background Image Carousel with Fade Animation */}
      {HERO_BANNERS.map((banner, idx) => (
        <div
          key={banner.id}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            idx === currentIndex ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
          }`}
        >
          <img
            src={banner.image}
            alt={banner.title}
            className="w-full h-full object-cover object-center scale-100 group-hover:scale-105 transition-transform duration-1000 ease-out"
          />
          {/* Subtle gradient overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20" />
        </div>
      ))}

      {/* Hero Content Overlay */}
      <div className="relative z-20 max-w-7xl mx-auto h-full px-6 sm:px-8 flex flex-col justify-end pb-16 sm:pb-24">
        <div className="max-w-xl space-y-4 animate-fade-in" key={current.id}>
          <span className="inline-block text-[11px] sm:text-xs font-bold tracking-[0.2em] text-neutral-300 uppercase">
            {current.subtitle}
          </span>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-white tracking-tighter leading-[0.95] drop-shadow-md">
            {current.title}
          </h1>
          <p className="text-neutral-300 text-sm sm:text-base font-normal max-w-md leading-relaxed">
            {current.description}
          </p>
          <div className="pt-2 flex items-center gap-4">
            <button
              onClick={() => onSelectProduct(current.productId)}
              className="px-6 py-3.5 bg-white hover:bg-neutral-200 text-black font-semibold text-xs sm:text-sm tracking-wide rounded-full transition-all duration-200 flex items-center gap-2 shadow-lg cursor-pointer transform hover:-translate-y-0.5"
            >
              {current.cta} <ArrowRight size={15} />
            </button>
            <span className="text-xs text-neutral-400 hidden sm:inline-block">
              Free 2-day delivery available
            </span>
          </div>
        </div>
      </div>

      {/* Manual Slide Controls */}
      <button
        onClick={() => setCurrentIndex((currentIndex - 1 + HERO_BANNERS.length) % HERO_BANNERS.length)}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-2.5 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/70 backdrop-blur-sm transition opacity-0 group-hover:opacity-100 cursor-pointer"
        aria-label="Previous slide"
      >
        <ChevronLeft size={22} />
      </button>

      <button
        onClick={() => setCurrentIndex((currentIndex + 1) % HERO_BANNERS.length)}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-2.5 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/70 backdrop-blur-sm transition opacity-0 group-hover:opacity-100 cursor-pointer"
        aria-label="Next slide"
      >
        <ChevronRight size={22} />
      </button>

      {/* Carousel Indicator Dots */}
      <div className="absolute bottom-6 right-6 sm:right-12 z-30 flex items-center space-x-2">
        {HERO_BANNERS.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className={`transition-all duration-300 rounded-full cursor-pointer ${
              idx === currentIndex
                ? "w-8 h-1.5 bg-white"
                : "w-2 h-1.5 bg-white/40 hover:bg-white/70"
            }`}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
