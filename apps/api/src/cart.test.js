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
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'product_not_found');
});

test('rejects a quantity that is not a number', () => {
  const cartId = 'test-cart-4';
  const result = addToCart(cartId, 'p1', '3');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_quantity');
  assert.equal(getCart(cartId).length, 0);
});

test('a rejected quantity never reaches the stored cart', () => {
  const cartId = 'test-cart-5';
  addToCart(cartId, 'p1', 2);
  addToCart(cartId, 'p1', '3');
  const cart = getCart(cartId);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 2);
  assert.equal(typeof cart[0].quantity, 'number');
  assert.equal(cartTotal(cartId), 109.98);
});

test('rejects zero, negative, and fractional quantities', () => {
  for (const quantity of [0, -5, 1.5, NaN, Infinity]) {
    const result = addToCart('test-cart-6', 'p1', quantity);
    assert.equal(result.ok, false, `expected ${quantity} to be rejected`);
    assert.equal(result.reason, 'invalid_quantity');
  }
  assert.equal(getCart('test-cart-6').length, 0);
});

test('defaults a missing quantity to 1', () => {
  const cartId = 'test-cart-7';
  const result = addToCart(cartId, 'p2', undefined);
  assert.equal(result.ok, true);
  assert.equal(getCart(cartId)[0].quantity, 1);
});

test('adding the same product twice sums the quantities', () => {
  const cartId = 'test-cart-8';
  addToCart(cartId, 'p1', 2);
  addToCart(cartId, 'p1', 3);
  const cart = getCart(cartId);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 5);
});
