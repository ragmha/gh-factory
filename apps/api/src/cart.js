import { products } from './products.js';

/** In-memory cart store, keyed by cartId (demo only — not for production use). */
const carts = new Map();

export function getCart(cartId) {
  if (!carts.has(cartId)) carts.set(cartId, []);
  return carts.get(cartId);
}

export function addToCart(cartId, productId, quantity = 1) {
  const product = products.find((p) => p.id === productId);
  if (!product) return null;

  const cart = getCart(cartId);
  const existing = cart.find((item) => item.productId === productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ productId, quantity });
  }
  return cart;
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
