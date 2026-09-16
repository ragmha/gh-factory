import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCart, addToCart, removeFromCart, cartTotal, MAX_QUANTITY } from './cart.js';

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
  for (const [label, call] of [
    ['omitted', () => addToCart(`test-cart-7-omitted`, 'p2')],
    ['undefined', () => addToCart(`test-cart-7-undefined`, 'p2', undefined)],
    ['null', () => addToCart(`test-cart-7-null`, 'p2', null)],
  ]) {
    const result = call();
    assert.equal(result.ok, true, `expected ${label} quantity to be accepted`);
    assert.equal(result.items[0].quantity, 1, `expected ${label} quantity to default to 1`);
  }
});

test('adding the same product twice sums the quantities', () => {
  const cartId = 'test-cart-8';
  addToCart(cartId, 'p1', 2);
  addToCart(cartId, 'p1', 3);
  const cart = getCart(cartId);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 5);
});

test('rejects a quantity above the per-line cap', () => {
  const cartId = 'test-cart-9';
  const result = addToCart(cartId, 'p1', MAX_QUANTITY + 1);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_quantity');
  assert.equal(getCart(cartId).length, 0);
});

test('repeated adds cannot walk past the per-line cap', () => {
  const cartId = 'test-cart-10';
  assert.equal(addToCart(cartId, 'p1', MAX_QUANTITY).ok, true);

  const result = addToCart(cartId, 'p1', 1);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'quantity_limit_exceeded');
  assert.equal(getCart(cartId)[0].quantity, MAX_QUANTITY);
});

test('a large valid add still cannot overflow the stored quantity', () => {
  const cartId = 'test-cart-11';
  const result = addToCart(cartId, 'p1', Number.MAX_SAFE_INTEGER);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid_quantity');
  assert.equal(getCart(cartId).length, 0);
});
