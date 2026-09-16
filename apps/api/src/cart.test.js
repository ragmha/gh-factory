import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCart, addToCart, removeFromCart, cartTotal } from './cart.js';

test('adds an item to the cart and computes total', () => {
  const cartId = 'test-cart-1';
  addToCart(cartId, 'p1', 2);
  const cart = getCart(cartId);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 2);
  assert.equal(cartTotal(cartId), 109.98);
});

test('removes an item from the cart', () => {
  const cartId = 'test-cart-2';
  addToCart(cartId, 'p2', 1);
  removeFromCart(cartId, 'p2');
  assert.equal(getCart(cartId).length, 0);
});

test('ignores unknown product ids', () => {
  const cartId = 'test-cart-3';
  const result = addToCart(cartId, 'does-not-exist', 1);
  assert.equal(result, null);
});
