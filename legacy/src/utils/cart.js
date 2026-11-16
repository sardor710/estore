export const FREE_SHIPPING_THRESHOLD = 50

export function calculateCartTotals(cart, promoCode = '') {
  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0)
  const discount = applyPromoCode(promoCode, subtotal)
  const finalSubtotal = Math.max(0, subtotal - discount)
  const hasFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD
  const amountNeededForFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal)
  const progressPercent = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100))

  return {
    subtotal,
    discount,
    finalSubtotal,
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
    amountNeededForFreeShipping,
    hasFreeShipping,
    progressPercent
  }
}

export function addToCart(cart, item, quantity = 1) {
  const existingIndex = cart.findIndex(
    i => i.id === item.id && i.selectedColor === item.selectedColor
  )

  if (existingIndex > -1) {
    return cart.map((cartItem, idx) => {
      if (idx === existingIndex) {
        return { ...cartItem, quantity: cartItem.quantity + quantity }
      }
      return cartItem
    })
  }

  return [...cart, { ...item, quantity }]
}

export function updateQuantity(cart, id, selectedColor, quantity) {
  if (quantity <= 0) {
    return removeFromCart(cart, id, selectedColor)
  }

  return cart.map(item => {
    if (item.id === id && item.selectedColor === selectedColor) {
      return { ...item, quantity }
    }
    return item
  })
}

export function removeFromCart(cart, id, selectedColor) {
  return cart.filter(item => !(item.id === id && item.selectedColor === selectedColor))
}

export function applyPromoCode(code, subtotal) {
  if (!code) return 0
  const clean = code.trim().toUpperCase()
  if (clean === 'NOMAD10') {
    return Math.round(subtotal * 0.1)
  }
  if (clean === 'NOMAD20') {
    return Math.round(subtotal * 0.2)
  }
  return 0
}

export function filterProducts(products, category = 'All', searchQuery = '') {
  return products.filter(product => {
    const matchCategory =
      !category || category === 'All' || product.category.toLowerCase() === category.toLowerCase()

    const matchQuery =
      !searchQuery ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.subName && product.subName.toLowerCase().includes(searchQuery.toLowerCase()))

    return matchCategory && matchQuery
  })
}
