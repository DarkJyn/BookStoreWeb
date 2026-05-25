/**
 * Literary Hearth — Cart Logic
 * Manages shopping cart using localStorage
 */

// ============== CART OPERATIONS ==============

function getCart() {
  return JSON.parse(localStorage.getItem('cart') || '[]');
}

function saveCart(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
  if (typeof updateCartBadge === 'function') updateCartBadge();
}

function addToCart(product) {
  const cart = getCart();
  const existing = cart.find(item => item.id === product.id);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  saveCart(cart);
  if (typeof showToast === 'function') {
    showToast(`"${product.title}" đã thêm vào giỏ!`);
  }
}

function removeFromCart(productId) {
  const cart = getCart().filter(item => item.id !== productId);
  saveCart(cart);
}

function updateQuantity(productId, delta) {
  let cart = getCart();
  const item = cart.find(item => item.id === productId);

  if (item) {
    item.quantity += delta;
    if (item.quantity <= 0) {
      // Auto-remove when quantity drops to 0
      cart = cart.filter(i => i.id !== productId);
    }
    saveCart(cart);
  }
}

function clearCart() {
  localStorage.removeItem('cart');
  if (typeof updateCartBadge === 'function') updateCartBadge();
}

function getCartTotal() {
  return getCart().reduce((sum, item) => sum + (item.price * item.quantity), 0);
}
