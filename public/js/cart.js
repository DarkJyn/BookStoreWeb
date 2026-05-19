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
    showToast(`"${product.title}" added to cart!`);
  }
}

function removeFromCart(productId) {
  const cart = getCart().filter(item => item.id !== productId);
  saveCart(cart);
}

function updateQuantity(productId, delta) {
  const cart = getCart();
  const item = cart.find(item => item.id === productId);
  
  if (item) {
    item.quantity = Math.max(1, item.quantity + delta);
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
