import { products } from './products.js';

/** In-memory cart store, keyed by cartId (demo only — not for production use). */
const carts = new Map();

/**
 * Validate a requested quantity. Returns a structured result so callers can
 * classify the failure themselves instead of guessing from a null.
 */
function parseQuantity(value) {
  if (value === undefined || value === null) return { ok: true, quantity: 1 };
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    return { ok: false, reason: 'invalid_quantity' };
  }
  return { ok: true, quantity: value };
}

export function getCart(cartId) {
  if (!carts.has(cartId)) carts.set(cartId, []);
  return carts.get(cartId);
}

export function addToCart(cartId, productId, quantity = 1) {
  const parsed = parseQuantity(quantity);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const product = products.find((p) => p.id === productId);
  if (!product) return { ok: false, reason: 'product_not_found' };

  const cart = getCart(cartId);
  const existing = cart.find((item) => item.productId === productId);
  if (existing) {
    existing.quantity += parsed.quantity;
  } else {
    cart.push({ productId, quantity: parsed.quantity });
  }
  return { ok: true, items: cart };
}

export function removeFromCart(cartId, productId) {
  const cart = getCart(cartId);
  const next = cart.filter((item) => item.productId !== productId);
  carts.set(cartId, next);
  return next;
}

export function cartTotal(cartId) {
  const cart = getCart(cartId);
  return cart.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);
}
