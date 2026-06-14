/**
 * Literary Hearth — Cart Logic
 * Manages shopping cart using localStorage and MongoDB sync
 */

// ============== CART OPERATIONS ==============

function getCart() {
  return JSON.parse(localStorage.getItem('cart') || '[]');
}

function saveCart(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
  if (typeof updateCartBadge === 'function') updateCartBadge();
  syncCartToServer();
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
      cart = cart.filter(i => i.id !== productId);
    }
    saveCart(cart);
  }
}

function clearCart() {
  localStorage.removeItem('cart');
  if (typeof updateCartBadge === 'function') updateCartBadge();
  syncCartToServer();
}

function getCartTotal() {
  return getCart().reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

// ============== MONGO SYNC LOGIC ==============

function syncCartToServer() {
  if (!window.isLoggedIn) return;
  const cart = getCart();
  
  fetch('/api/cart/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cart })
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      console.error('Failed to sync cart to server:', data.message);
    }
  })
  .catch(err => console.error('Error syncing cart:', err));
}

// Tự động đồng bộ giỏ hàng khi tải trang / đăng nhập / đăng xuất
document.addEventListener('DOMContentLoaded', () => {
  if (window.isLoggedIn) {
    // Lấy giỏ hàng mới nhất từ MongoDB
    fetch('/api/cart')
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        localStorage.setItem('cart', JSON.stringify(data.cart || []));
        if (typeof updateCartBadge === 'function') updateCartBadge();
        if (typeof renderCart === 'function') renderCart();
      }
    })
    .catch(err => console.error('Error fetching cart:', err));
  } else {
    // Nếu chưa đăng nhập / đăng xuất, xóa sạch giỏ hàng cục bộ
    localStorage.removeItem('cart');
    if (typeof updateCartBadge === 'function') updateCartBadge();
    if (typeof renderCart === 'function') renderCart();
  }
});
