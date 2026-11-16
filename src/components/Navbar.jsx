import React, { useState } from 'react'
import { Search, ShoppingBag, Menu, X, ArrowRight, ShieldCheck } from 'lucide-react'

export default function Navbar({
  cartCount,
  onOpenCart,
  activeCategory,
  onSelectCategory,
  onSearch,
  searchQuery,
  onOpenProduct
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [announcementIndex, setAnnouncementIndex] = useState(0)
  const [activeMenuHover, setActiveMenuHover] = useState(null)

  const announcements = [
    "Free Shipping on US Orders Over $50",
    "Discover the All-New Stand One Max & Sport Band Collections",
    "Crafted with Authentic Chicago Horween® Leather"
  ]

  const categories = [
    { name: "Best Sellers", id: "All" },
    { name: "Cases", id: "Cases" },
    { name: "Watch", id: "Watch" },
    { name: "Charging", id: "Charging" },
    { name: "Tracking & Wallets", id: "Tracking & Wallets" },
    { name: "Sale", id: "Sale", badge: "SALE" }
  ]

  const megaMenuData = {
    "Cases": [
      {
        title: "iPhone Cases",
        links: [
          { name: "iPhone 16 Pro Max", id: "traditional-leather-case" },
          { name: "iPhone 16 Pro", id: "traditional-leather-case" },
          { name: "Traditional Leather", id: "traditional-leather-case" },
          { name: "Horween Rugged Collection", id: "traditional-leather-case" }
        ]
      },
      {
        title: "Materials",
        links: [
          { name: "Horween® Leather", badge: "PREMIUM" },
          { name: "Rugged Polycarbonate" },
          { name: "Anodized Aluminum Buttons" }
        ]
      },
      {
        title: "Featured Gear",
        image: "https://cdn.shopify.com/s/files/1/0384/6721/files/iphone-16-leather-cases-collection-banner.jpg?v=1727202137&width=400",
        label: "Traditional Leather Case",
        productId: "traditional-leather-case"
      }
    ],
    "Watch": [
      {
        title: "Apple Watch Bands",
        links: [
          { name: "Sport Band (FKM Rubber)", id: "sport-band" },
          { name: "Ultra Ready (49mm / 45mm)", id: "sport-band" },
          { name: "Waterproof Series", id: "sport-band" }
        ]
      },
      {
        title: "Features",
        links: [
          { name: "100% Waterproof FKM" },
          { name: "Ventilation Channels" },
          { name: "Custom 316 Stainless Steel Pin" }
        ]
      },
      {
        title: "Featured Band",
        image: "https://cdn.shopify.com/s/files/1/0384/6721/files/sport-band-stone-iphone-16-pro-max-stone-case-banner.jpg?v=1727202625&width=400",
        label: "Sport Band in Lunar Gray",
        productId: "sport-band"
      }
    ],
    "Charging": [
      {
        title: "Wireless & MagSafe",
        links: [
          { name: "Stand One Max (3-in-1)", id: "stand-one-max" },
          { name: "Official 15W MagSafe Fast Charge", id: "stand-one-max" },
          { name: "AirPods & Watch Charging Puck", id: "stand-one-max" }
        ]
      },
      {
        title: "Everyday Power",
        links: [
          { name: "ChargeKey Keychain Cable", id: "chargekey" },
          { name: "240W Fast Charging Support", id: "chargekey" }
        ]
      },
      {
        title: "Flagship Charger",
        image: "https://cdn.shopify.com/s/files/1/0384/6721/files/magsafe_efc9b29d-cefd-4574-8757-769cb40deaf0.png?v=1718833901&width=400",
        label: "Stand One Max (4th Gen)",
        productId: "stand-one-max"
      }
    ],
    "Tracking & Wallets": [
      {
        title: "Everyday Carry Wallets",
        links: [
          { name: "Card Wallet Plus", id: "card-wallet-plus" },
          { name: "Holds 16 Cards & Cash", id: "card-wallet-plus" },
          { name: "Thermoformed Horween Leather", id: "card-wallet-plus" }
        ]
      },
      {
        title: "Craftsmanship",
        links: [
          { name: "Vegetable-Tanned American Leather" },
          { name: "Patina Guarantee" },
          { name: "Bonded Nylon Stitching" }
        ]
      },
      {
        title: "Featured Wallet",
        image: "https://cdn.shopify.com/s/files/1/0384/6721/files/card_wallet_plus_dcc2a21e-aa29-47b2-91be-3ffff05a92db.jpg?v=1749145089&width=400",
        label: "Card Wallet Plus in Horween",
        productId: "card-wallet-plus"
      }
    ]
  }

  return (
    <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-neutral-100 transition-all">
      {/* Announcement Bar */}
      <div className="bg-neutral-900 text-white text-[11px] font-medium tracking-wide py-2 px-4 text-center flex items-center justify-between">
        <div className="flex-1 text-center">
          <span className="opacity-90">{announcements[announcementIndex]}</span>
        </div>
        <button
          onClick={() => setAnnouncementIndex((announcementIndex + 1) % announcements.length)}
          className="text-neutral-400 hover:text-white transition text-[10px] uppercase font-semibold hidden md:inline-flex items-center gap-1 cursor-pointer"
        >
          Next <ArrowRight size={10} />
        </button>
      </div>

      {/* Main Header Bar */}
      <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Mobile hamburger */}
        <div className="flex items-center md:hidden">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-neutral-800 hover:text-black focus:outline-none cursor-pointer"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Center/Left: Minimalist Brand Emblem */}
        <div className="flex items-center gap-8">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault()
              onSelectCategory('All')
            }}
            className="flex items-center py-2 group cursor-pointer"
            aria-label="Home"
          >
            <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center transition-all duration-300 group-hover:bg-black group-hover:scale-105 shadow-xs">
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

          {/* Desktop Categories Navigation with Mega Menu */}
          <nav className="hidden md:flex items-center space-x-6 text-[13px] font-medium tracking-tight">
            {categories.map(cat => (
              <div
                key={cat.id}
                className="relative py-5"
                onMouseEnter={() => megaMenuData[cat.name] && setActiveMenuHover(cat.name)}
                onMouseLeave={() => setActiveMenuHover(null)}
              >
                <button
                  onClick={() => onSelectCategory(cat.id)}
                  className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
                    activeCategory === cat.id
                      ? "text-black font-semibold border-b-2 border-black -mb-[2px] pb-1"
                      : "text-neutral-700 hover:text-black"
                  }`}
                >
                  {cat.name}
                  {cat.badge && (
                    <span className="text-[9px] bg-red-600 text-white font-bold px-1.5 py-0.5 rounded tracking-wider">
                      {cat.badge}
                    </span>
                  )}
                </button>

                {/* Dropdown Mega Menu */}
                {activeMenuHover === cat.name && megaMenuData[cat.name] && (
                  <div className="absolute left-0 top-full w-[540px] bg-white border border-neutral-200 shadow-xl rounded-b-xl p-6 grid grid-cols-3 gap-6 animate-fade-in z-50">
                    {megaMenuData[cat.name].map((col, idx) => (
                      <div key={idx} className="space-y-3">
                        {col.title && (
                          <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                            {col.title}
                          </h4>
                        )}
                        {col.links && (
                          <ul className="space-y-2 text-xs">
                            {col.links.map((link, lIdx) => (
                              <li key={lIdx}>
                                <button
                                  onClick={() => {
                                    if (link.id) onOpenProduct(link.id)
                                    else onSelectCategory(cat.id)
                                    setActiveMenuHover(null)
                                  }}
                                  className="text-neutral-800 hover:text-black hover:translate-x-0.5 transition flex items-center gap-1 text-left cursor-pointer"
                                >
                                  {link.name}
                                  {link.badge && (
                                    <span className="text-[8px] bg-blue-600 text-white px-1 rounded font-bold">
                                      {link.badge}
                                    </span>
                                  )}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {col.image && (
                          <div
                            onClick={() => {
                              onOpenProduct(col.productId)
                              setActiveMenuHover(null)
                            }}
                            className="group cursor-pointer space-y-2"
                          >
                            <div className="rounded-lg overflow-hidden bg-neutral-100 aspect-video">
                              <img
                                src={col.image}
                                alt={col.label}
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                              />
                            </div>
                            <p className="text-[11px] font-medium text-neutral-900 group-hover:text-blue-600 transition flex items-center justify-between">
                              {col.label} <ArrowRight size={12} />
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Right: Search & Cart Button */}
        <div className="flex items-center space-x-3">
          {/* Search Toggle */}
          <div className="relative">
            {searchOpen ? (
              <div className="flex items-center bg-neutral-100 rounded-full px-3 py-1.5 animate-fade-in">
                <Search size={15} className="text-neutral-400 mr-2" />
                <input
                  type="text"
                  placeholder="Search gear..."
                  value={searchQuery}
                  onChange={(e) => onSearch(e.target.value)}
                  className="bg-transparent text-xs text-neutral-900 focus:outline-none w-36 sm:w-48"
                  autoFocus
                />
                <button
                  onClick={() => {
                    setSearchOpen(false)
                    onSearch('')
                  }}
                  className="text-neutral-400 hover:text-neutral-700 ml-1 text-xs cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="p-2 text-neutral-700 hover:text-black hover:bg-neutral-100 rounded-full transition cursor-pointer"
                aria-label="Search gear"
              >
                <Search size={18} />
              </button>
            )}
          </div>

          {/* Cart Drawer Trigger */}
          <button
            onClick={onOpenCart}
            className="flex items-center gap-2 p-2 px-3 text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-full transition font-medium text-xs cursor-pointer"
            aria-label="Open cart drawer"
          >
            <ShoppingBag size={17} />
            <span className="font-semibold">{cartCount}</span>
          </button>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-neutral-200 px-5 py-4 space-y-4 animate-slide-down">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search gear..."
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-neutral-100 rounded-lg text-xs text-neutral-900 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => {
                  onSelectCategory(cat.id)
                  setMobileMenuOpen(false)
                }}
                className={`w-full text-left py-2.5 px-3 rounded-lg text-sm flex items-center justify-between ${
                  activeCategory === cat.id
                    ? "bg-neutral-900 text-white font-semibold"
                    : "text-neutral-800 hover:bg-neutral-100"
                }`}
              >
                <span>{cat.name}</span>
                {cat.badge && (
                  <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold">
                    {cat.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-neutral-100 text-xs text-neutral-500 space-y-2">
            <p className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-emerald-600" />
              2-Year Warranty on all gear
            </p>
            <p>Free domestic shipping on orders over $50</p>
          </div>
        </div>
      )}
    </div>
  )
}
