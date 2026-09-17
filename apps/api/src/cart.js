import { products } from './products.js';

/** In-memory cart store, keyed by cartId (demo only — not for production use). */
const carts = new Map();

/** Most of a single product one cart line may hold. */
export const MAX_QUANTITY = 99;

/**
 * Validate a requested quantity. Returns a structured result so callers can
 * classify the failure themselves instead of guessing from a null.
 *
 * Owns the default, so callers pass the raw value through rather than
 * defaulting it themselves and leaving this branch unreachable. Only an
 * omitted quantity defaults; an explicit null is a value the caller chose and
 * gets validated like any other, the same way "3" does.
 */
function parseQuantity(value) {
  if (value === undefined) return { ok: true, quantity: 1 };
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { ok: false, reason: 'invalid_quantity' };
  }
  if (value < 1 || value > MAX_QUANTITY) return { ok: false, reason: 'invalid_quantity' };
  return { ok: true, quantity: value };
}

export function getCart(cartId) {
  if (!carts.has(cartId)) carts.set(cartId, []);
  return carts.get(cartId);
}

export function addToCart(cartId, productId, quantity) {
  const parsed = parseQuantity(quantity);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const product = products.find((p) => p.id === productId);
  if (!product) return { ok: false, reason: 'product_not_found' };

  const cart = getCart(cartId);
  const existing = cart.find((item) => item.productId === productId);

  // Each add is valid on its own, so check the running total too. Otherwise
  // repeated adds walk past the cap the validation above exists to enforce.
  const nextQuantity = (existing?.quantity ?? 0) + parsed.quantity;
  if (nextQuantity > MAX_QUANTITY) return { ok: false, reason: 'quantity_limit_exceeded' };

  if (existing) {
    existing.quantity = nextQuantity;
  } else {
    cart.push({ productId, quantity: nextQuantity });
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
