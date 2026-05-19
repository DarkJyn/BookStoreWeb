/**
 * Literary Hearth — Shared App Utilities
 * Handles common functionality across all pages
 */

// ============== CART BADGE ==============
function updateCartBadge() {
  const cart = JSON.parse(localStorage.getItem('cart') || '[]');
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  
  document.querySelectorAll('[data-cart-badge]').forEach(badge => {
    if (totalItems > 0) {
      badge.textContent = totalItems;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  });
}

// ============== TOAST NOTIFICATION ==============
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  const bgColor = type === 'success' ? '#4a6549' : type === 'error' ? '#ba1a1a' : '#4a321d';
  
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    background: ${bgColor}; color: white;
    padding: 12px 24px; border-radius: 8px;
    font-family: 'DM Sans', sans-serif; font-size: 14px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.15);
    transform: translateY(100px); opacity: 0;
    transition: all 0.3s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.transform = 'translateY(100px)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============== INIT ==============
document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();
});
