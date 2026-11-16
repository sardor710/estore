import { describe, it, expect } from 'vitest'
import { PRODUCTS, HERO_BANNERS } from '../data/products'
import { calculateCartTotals, addToCart, removeFromCart, updateQuantity, applyPromoCode, filterProducts } from '../utils/cart'

describe('Nomad Store Data & Products', () => {
  it('loads at least 5 main products with required Nomad Goods attributes', () => {
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(5)
    
    PRODUCTS.forEach(product => {
      expect(product).toHaveProperty('id')
      expect(product).toHaveProperty('name')
      expect(product).toHaveProperty('price')
      expect(product.price).toBeGreaterThan(0)
      expect(product).toHaveProperty('category')
      expect(product).toHaveProperty('description')
      expect(product).toHaveProperty('features')
      expect(Array.isArray(product.features)).toBe(true)
      expect(product.features.length).toBeGreaterThanOrEqual(3)
      expect(product).toHaveProperty('images')
      expect(Array.isArray(product.images)).toBe(true)
      expect(product.images.length).toBeGreaterThanOrEqual(3)
      expect(product).toHaveProperty('specs')
      expect(Object.keys(product.specs).length).toBeGreaterThanOrEqual(3)
      expect(product).toHaveProperty('colors')
      expect(product.colors.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('includes core Nomad Goods flagships: Modern Leather Case, Stand One Max, Traditional Leather Case, Sport Band, Card Wallet Plus, ChargeKey', () => {
    const ids = PRODUCTS.map(p => p.id)
    expect(ids).toContain('modern-leather-case')
    expect(ids).toContain('stand-one-max')
    expect(ids).toContain('traditional-leather-case')
    expect(ids).toContain('sport-band')
    expect(ids).toContain('card-wallet-plus')
    expect(ids).toContain('chargekey')
  })

  it('defines hero banners with valid images and product links', () => {
    expect(HERO_BANNERS.length).toBeGreaterThanOrEqual(3)
    HERO_BANNERS.forEach(banner => {
      expect(banner).toHaveProperty('title')
      expect(banner).toHaveProperty('image')
      expect(banner).toHaveProperty('productId')
    })
  })
})

describe('Cart Business Logic', () => {
  const sampleItem = {
    id: 'stand-one-max',
    name: 'Stand One Max',
    price: 159,
    selectedColor: 'Silver',
    image: 'https://cdn.shopify.com/sample.jpg'
  }

  const cheapItem = {
    id: 'chargekey',
    name: 'ChargeKey',
    price: 35,
    selectedColor: 'Silver',
    image: 'https://cdn.shopify.com/chargekey.jpg'
  }

  it('adds an item to an empty cart', () => {
    const cart = []
    const updated = addToCart(cart, sampleItem, 1)
    expect(updated.length).toBe(1)
    expect(updated[0].quantity).toBe(1)
    expect(updated[0].id).toBe('stand-one-max')
  })

  it('increments quantity when same item and color are added again', () => {
    const cart = [{ ...sampleItem, quantity: 1 }]
    const updated = addToCart(cart, sampleItem, 2)
    expect(updated.length).toBe(1)
    expect(updated[0].quantity).toBe(3)
  })

  it('calculates subtotal and free shipping progress properly ($50 threshold)', () => {
    const cartUnder = [{ ...cheapItem, quantity: 1 }]
    const totalsUnder = calculateCartTotals(cartUnder)
    expect(totalsUnder.subtotal).toBe(35)
    expect(totalsUnder.freeShippingThreshold).toBe(50)
    expect(totalsUnder.amountNeededForFreeShipping).toBe(15)
    expect(totalsUnder.hasFreeShipping).toBe(false)
    expect(totalsUnder.progressPercent).toBe(70)

    const cartOver = [{ ...sampleItem, quantity: 1 }]
    const totalsOver = calculateCartTotals(cartOver)
    expect(totalsOver.subtotal).toBe(159)
    expect(totalsOver.amountNeededForFreeShipping).toBe(0)
    expect(totalsOver.hasFreeShipping).toBe(true)
    expect(totalsOver.progressPercent).toBe(100)
  })

  it('updates quantity and removes item when quantity reaches zero', () => {
    const cart = [{ ...sampleItem, quantity: 2 }]
    const decremented = updateQuantity(cart, sampleItem.id, sampleItem.selectedColor, 1)
    expect(decremented[0].quantity).toBe(1)

    const zeroed = updateQuantity(cart, sampleItem.id, sampleItem.selectedColor, 0)
    expect(zeroed.length).toBe(0)
  })

  it('removes item directly with removeFromCart', () => {
    const cart = [{ ...sampleItem, quantity: 2 }]
    const result = removeFromCart(cart, sampleItem.id, sampleItem.selectedColor)
    expect(result.length).toBe(0)
  })

  it('TDD Target 1: applies valid promo code NOMAD10 for 10% discount', () => {
    const discount = applyPromoCode('NOMAD10', 100)
    expect(discount).toBe(10)

    const invalid = applyPromoCode('INVALID', 100)
    expect(invalid).toBe(0)
  })

  it('TDD Target 2: filters products by category and query term', () => {
    const chargingProducts = filterProducts(PRODUCTS, 'Charging', '')
    expect(chargingProducts.length).toBeGreaterThanOrEqual(1)
    expect(chargingProducts.every(p => p.category === 'Charging')).toBe(true)

    const searched = filterProducts(PRODUCTS, 'All', 'Leather')
    expect(searched.length).toBeGreaterThanOrEqual(1)
    expect(searched.some(p => p.name.includes('Leather'))).toBe(true)
  })
})
