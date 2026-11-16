import React, { useState } from 'react'
import { ArrowRight, Check, ShieldCheck, RefreshCw, Truck } from 'lucide-react'

export default function Footer({ onSelectCategory }) {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  const handleSubscribe = (e) => {
    e.preventDefault()
    if (email) {
      setSubscribed(true)
      setEmail('')
      setTimeout(() => setSubscribed(false), 4000)
    }
  }

  return (
    <footer className="bg-neutral-950 text-white pt-16 pb-12 border-t border-neutral-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        {/* Value Proposition Badges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8 border-y border-neutral-800/80">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-neutral-900 flex items-center justify-center shrink-0 text-white">
              <Truck size={22} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white tracking-wide">Free US Shipping</h4>
              <p className="text-xs text-neutral-400 mt-0.5">Complimentary shipping on all domestic orders over $50</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-neutral-900 flex items-center justify-center shrink-0 text-white">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white tracking-wide">2-Year Craftsmanship Warranty</h4>
              <p className="text-xs text-neutral-400 mt-0.5">Built to endure with uncompromising materials and craftsmanship</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-neutral-900 flex items-center justify-center shrink-0 text-white">
              <RefreshCw size={22} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white tracking-wide">30-Day Hassle-Free Returns</h4>
              <p className="text-xs text-neutral-400 mt-0.5">Love your gear or return it within 30 days for a full refund</p>
            </div>
          </div>
        </div>

        {/* Main Footer Links & Newsletter */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Brand & Newsletter (5 Cols) */}
          <div className="lg:col-span-5 space-y-5">
            <a href="/" className="inline-flex items-center gap-2 group cursor-pointer" aria-label="Home">
              <div className="w-9 h-9 rounded-lg bg-neutral-900 text-white flex items-center justify-center border border-neutral-800 transition-all duration-300 group-hover:scale-105 group-hover:border-neutral-700">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 2 22 22 22 12 2" fill="currentColor" fillOpacity="0.2" />
                  <polyline points="12 7 7 18 17 18 12 7" fill="currentColor" />
                </svg>
              </div>
            </a>

            <p className="text-xs text-neutral-400 max-w-sm leading-relaxed">
              Deeply engineered, minimalist tools for modern everyday carry. Built with genuine Horween leather, titanium, and advanced wireless power.
            </p>

            <form onSubmit={handleSubscribe} className="space-y-2 pt-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300">
                Join the Community
              </label>
              <div className="flex gap-2 max-w-md">
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="flex-1 px-4 py-2.5 bg-neutral-900 border border-neutral-800 rounded-full text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white transition"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-white text-black font-semibold text-xs rounded-full hover:bg-neutral-200 transition flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {subscribed ? <Check size={14} /> : <>Sign Up <ArrowRight size={13} /></>}
                </button>
              </div>
              {subscribed && (
                <p className="text-xs text-emerald-400 font-medium">
                  Welcome! Check your inbox for your 10% welcome code.
                </p>
              )}
            </form>
          </div>

          {/* Nav Links (7 Cols across 3 sub-columns) */}
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8 text-xs">
            {/* Column 1: Shop */}
            <div className="space-y-3">
              <h5 className="font-bold uppercase tracking-wider text-neutral-300">Shop</h5>
              <ul className="space-y-2 text-neutral-400">
                <li>
                  <button onClick={() => onSelectCategory('Cases')} className="hover:text-white transition cursor-pointer">
                    iPhone Cases
                  </button>
                </li>
                <li>
                  <button onClick={() => onSelectCategory('Watch')} className="hover:text-white transition cursor-pointer">
                    Apple Watch Bands
                  </button>
                </li>
                <li>
                  <button onClick={() => onSelectCategory('Charging')} className="hover:text-white transition cursor-pointer">
                    MagSafe Chargers
                  </button>
                </li>
                <li>
                  <button onClick={() => onSelectCategory('Tracking & Wallets')} className="hover:text-white transition cursor-pointer">
                    Horween Wallets
                  </button>
                </li>
                <li>
                  <button onClick={() => onSelectCategory('Charging')} className="hover:text-white transition cursor-pointer">
                    Cables & Power
                  </button>
                </li>
                <li>
                  <button onClick={() => onSelectCategory('Sale')} className="text-red-400 hover:text-red-300 transition cursor-pointer">
                    Special Offers
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 2: About Us */}
            <div className="space-y-3">
              <h5 className="font-bold uppercase tracking-wider text-neutral-300">About Us</h5>
              <ul className="space-y-2 text-neutral-400">
                <li><a href="#about" className="hover:text-white transition">Our Story</a></li>
                <li><a href="#horween" className="hover:text-white transition">Horween® Leather</a></li>
                <li><a href="#materials" className="hover:text-white transition">Materials & Craft</a></li>
                <li><a href="#sustainability" className="hover:text-white transition">Climate Neutral</a></li>
                <li><a href="#careers" className="hover:text-white transition">Careers</a></li>
                <li><a href="#press" className="hover:text-white transition">Press Inquiries</a></li>
              </ul>
            </div>

            {/* Column 3: Support */}
            <div className="space-y-3">
              <h5 className="font-bold uppercase tracking-wider text-neutral-300">Support</h5>
              <ul className="space-y-2 text-neutral-400">
                <li><a href="#help" className="hover:text-white transition">Help Center</a></li>
                <li><a href="#track" className="hover:text-white transition">Track Your Order</a></li>
                <li><a href="#returns" className="hover:text-white transition">Returns & Exchanges</a></li>
                <li><a href="#warranty" className="hover:text-white transition">Warranty Claims</a></li>
                <li><a href="#compatibility" className="hover:text-white transition">Device Compatibility</a></li>
                <li><a href="#contact" className="hover:text-white transition">Contact Us</a></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Copyright & Legal */}
        <div className="pt-8 border-t border-neutral-900 flex flex-col sm:flex-row justify-between items-center gap-4 text-[11px] text-neutral-500">
          <p>© 2026 ALL RIGHTS RESERVED.</p>
          <div className="flex flex-wrap gap-4">
            <a href="#privacy" className="hover:text-neutral-400 transition">Privacy Policy</a>
            <a href="#terms" className="hover:text-neutral-400 transition">Terms of Service</a>
            <a href="#accessibility" className="hover:text-neutral-400 transition">Accessibility</a>
            <a href="#patents" className="hover:text-neutral-400 transition">Patents</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
