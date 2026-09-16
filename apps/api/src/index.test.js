import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './index.js';
import { MAX_QUANTITY } from './cart.js';

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

function addItem(cartId, body) {
  return fetch(`${baseUrl}/api/cart/${cartId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('accepts a valid quantity', async () => {
  const res = await addItem('http-cart-1', { productId: 'p1', quantity: 2 });
  assert.equal(res.status, 200);
  const cart = await res.json();
  assert.equal(cart.items[0].quantity, 2);
  assert.equal(cart.total, 109.98);
});

test('a missing quantity still defaults to 1', async () => {
  const res = await addItem('http-cart-2', { productId: 'p2' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).items[0].quantity, 1);
});

test('a null quantity still defaults to 1', async () => {
  const res = await addItem('http-cart-3', { productId: 'p2', quantity: null });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).items[0].quantity, 1);
});

test('rejects an invalid quantity with 400', async () => {
  for (const quantity of ['3', 0, -2, 1.5, true, [], {}]) {
    const res = await addItem('http-cart-4', { productId: 'p1', quantity });
    assert.equal(res.status, 400, `expected ${JSON.stringify(quantity)} to be rejected`);
    assert.match((await res.json()).error, /quantity must be a whole number/);
  }
});

test('reports an unknown product as 404', async () => {
  const res = await addItem('http-cart-5', { productId: 'does-not-exist', quantity: 1 });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'Product not found');
});

test('a missing productId is a 400', async () => {
  const res = await addItem('http-cart-6', { quantity: 1 });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'productId is required');
});

test('exceeding the per-line cap across requests is a 409', async () => {
  const cartId = 'http-cart-7';
  assert.equal((await addItem(cartId, { productId: 'p1', quantity: MAX_QUANTITY })).status, 200);

  const res = await addItem(cartId, { productId: 'p1', quantity: 1 });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /cannot hold more than/);
});

test('a rejected request leaves the cart untouched', async () => {
  const cartId = 'http-cart-8';
  await addItem(cartId, { productId: 'p1', quantity: 2 });
  await addItem(cartId, { productId: 'p1', quantity: '3' });

  const cart = await (await fetch(`${baseUrl}/api/cart/${cartId}`)).json();
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].quantity, 2);
  assert.equal(cart.total, 109.98);
});
