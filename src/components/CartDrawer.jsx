import React, { useState } from 'react'
import { X, Plus, Minus, Trash2, ShieldCheck, Lock, ArrowRight, Tag, CheckCircle2 } from 'lucide-react'
import { calculateCartTotals } from '../utils/cart'
import { PRODUCTS } from '../data/products'

export default function CartDrawer({
  isOpen,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onSelectProduct
}) {
  const [promoInput, setPromoInput] = useState('')
  const [appliedPromo, setAppliedPromo] = useState('')
  const [promoError, setPromoError] = useState('')

  if (!isOpen) return null

  const totals = calculateCartTotals(cart, appliedPromo)

  const handleApplyPromo = (e) => {
    e.preventDefault()
    setPromoError('')
    const clean = promoInput.trim().toUpperCase()
    if (clean === 'NOMAD10' || clean === 'NOMAD20') {
      setAppliedPromo(clean)
      setPromoInput('')
    } else {
      setPromoError('Invalid promo code. Try "NOMAD10" for 10% off.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-300"
      />

      {/* Drawer Panel */}
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col animate-drawer">
          {/* Drawer Header */}
          <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-neutral-900 tracking-tight">Your Cart</h2>
              <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full font-medium">
                {cart.reduce((sum, item) => sum + item.quantity, 0)} items
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-black rounded-full hover:bg-neutral-100 transition cursor-pointer"
              aria-label="Close cart drawer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Free Shipping Progress Indicator */}
          <div className="bg-neutral-50 px-5 py-3 border-b border-neutral-100">
            <div className="flex justify-between items-center text-xs mb-1.5 font-medium">
              {totals.hasFreeShipping ? (
                <span className="text-emerald-700 flex items-center gap-1 font-semibold">
                  <CheckCircle2 size={13} /> You've unlocked Free Shipping!
                </span>
              ) : (
                <span className="text-neutral-700">
                  You’re <strong className="text-black">${totals.amountNeededForFreeShipping.toFixed(2)}</strong> away from free shipping!
                </span>
              )}
              <span className="text-neutral-400 text-[11px] font-semibold">
                {totals.progressPercent}%
              </span>
            </div>
            <div className="w-full bg-neutral-200 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  totals.hasFreeShipping ? "bg-emerald-600" : "bg-neutral-900"
                }`}
                style={{ width: `${totals.progressPercent}%` }}
              />
            </div>
          </div>

          {/* Cart Items Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {cart.length === 0 ? (
              <div className="py-12 text-center space-y-4">
                <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mx-auto text-neutral-400">
                  <Tag size={28} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-neutral-900">Your Cart is Empty</h3>
                  <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                    Upgrade your everyday carry with gear that’s built to go the distance.
                  </p>
                </div>

                {/* Recommendations in Empty Cart */}
                <div className="pt-6 border-t border-neutral-100 text-left">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">
                    Featured Recommendations
                  </h4>
                  <div className="space-y-3">
                    {PRODUCTS.slice(0, 3).map((rec) => (
                      <div
                        key={rec.id}
                        onClick={() => {
                          onSelectProduct(rec.id)
                          onClose()
                        }}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-50 transition cursor-pointer border border-transparent hover:border-neutral-200"
                      >
                        <div className="w-14 h-14 bg-neutral-100 rounded-md overflow-hidden p-1 shrink-0">
                          <img
                            src={rec.images[0]}
                            alt={rec.name}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-neutral-900 truncate">{rec.name}</p>
                          <p className="text-[11px] text-neutral-500">{rec.subName}</p>
                          <p className="text-xs font-semibold text-neutral-900">${rec.price}</p>
                        </div>
                        <ArrowRight size={14} className="text-neutral-400" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {cart.map((item) => (
                  <div
                    key={`${item.id}-${item.selectedColor}`}
                    className="flex gap-4 p-3 rounded-xl border border-neutral-100 bg-white hover:border-neutral-200 transition"
                  >
                    <div className="w-20 h-20 bg-neutral-50 rounded-lg overflow-hidden p-2 shrink-0 flex items-center justify-center">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1 flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-sm font-bold text-neutral-900 leading-tight">
                            {item.name}
                          </h4>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            Color: <span className="font-medium text-neutral-700">{item.selectedColor}</span>
                          </p>
                        </div>
                        <button
                          onClick={() => onRemoveItem(item.id, item.selectedColor)}
                          className="text-neutral-400 hover:text-red-600 transition p-1 cursor-pointer"
                          aria-label="Remove item"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="flex justify-between items-center pt-2">
                        {/* Quantity Counter */}
                        <div className="flex items-center border border-neutral-200 rounded-md bg-white">
                          <button
                            onClick={() => onUpdateQuantity(item.id, item.selectedColor, item.quantity - 1)}
                            className="p-1 px-2 text-neutral-600 hover:text-black hover:bg-neutral-100 transition cursor-pointer"
                            aria-label="Decrease quantity"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="px-2 text-xs font-semibold text-neutral-900">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => onUpdateQuantity(item.id, item.selectedColor, item.quantity + 1)}
                            className="p-1 px-2 text-neutral-600 hover:text-black hover:bg-neutral-100 transition cursor-pointer"
                            aria-label="Increase quantity"
                          >
                            <Plus size={12} />
                          </button>
                        </div>

                        <span className="text-sm font-bold text-neutral-900">
                          ${item.price * item.quantity}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Promo Code Input */}
                <form onSubmit={handleApplyPromo} className="pt-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Promo code (e.g. NOMAD10)"
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs border border-neutral-200 rounded-lg uppercase tracking-wider focus:outline-none focus:border-black"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold rounded-lg transition cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                  {appliedPromo && (
                    <p className="text-[11px] text-emerald-600 font-medium mt-1 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Coupon {appliedPromo} applied (-10%)
                    </p>
                  )}
                  {promoError && (
                    <p className="text-[11px] text-red-600 mt-1">{promoError}</p>
                  )}
                </form>
              </div>
            )}
          </div>

          {/* Drawer Footer & Checkout */}
          {cart.length > 0 && (
            <div className="p-5 border-t border-neutral-100 bg-white space-y-3">
              <div className="space-y-1.5 text-xs text-neutral-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-neutral-900">${totals.subtotal.toFixed(2)}</span>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Discount ({appliedPromo})</span>
                    <span>-${totals.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span>{totals.hasFreeShipping ? <strong className="text-emerald-600">FREE</strong> : "$8.00"}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-neutral-950 pt-2 border-t border-neutral-100">
                  <span>Total</span>
                  <span>${totals.finalSubtotal.toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={() => alert("Demo Checkout — Thank you for reviewing!")}
                className="w-full py-3.5 bg-neutral-900 hover:bg-black text-white font-semibold text-xs tracking-wider uppercase rounded-full shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock size={14} /> Secure Checkout
              </button>

              <div className="text-center text-[11px] text-neutral-400 flex items-center justify-center gap-2 pt-1">
                <ShieldCheck size={13} className="text-neutral-500" />
                <span>Easy Returns • 2 Year Craftsmanship Warranty</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
