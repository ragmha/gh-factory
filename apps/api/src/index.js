import express from 'express';
import cors from 'cors';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { products } from './products.js';
import { getCart, addToCart, removeFromCart, cartTotal, MAX_QUANTITY } from './cart.js';

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Basic request logging — useful signal for Application Insights / Log Analytics.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(
      JSON.stringify({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - start,
      }),
    );
  });
  next();
});

// Liveness/readiness probe used by Container Apps health checks and the SRE agent.
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', uptimeSeconds: process.uptime() });
});

app.get('/api/products', (req, res) => {
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

app.get('/api/cart/:cartId', (req, res) => {
  res.json({ items: getCart(req.params.cartId), total: cartTotal(req.params.cartId) });
});

// Maps a cart service failure to its HTTP response. Every reason the service
// can return needs an entry here; an unmapped one is a bug, not a 400.
const CART_FAILURES = {
  product_not_found: { status: 404, error: 'Product not found' },
  invalid_quantity: {
    status: 400,
    error: `quantity must be a whole number between 1 and ${MAX_QUANTITY}`,
  },
  quantity_limit_exceeded: {
    status: 409,
    error: `a cart line cannot hold more than ${MAX_QUANTITY} of the same item`,
  },
};

app.post('/api/cart/:cartId/items', (req, res) => {
  const { productId, quantity } = req.body || {};
  if (!productId) return res.status(400).json({ error: 'productId is required' });

  const result = addToCart(req.params.cartId, productId, quantity);
  if (!result.ok) {
    const failure = CART_FAILURES[result.reason];
    if (!failure) {
      console.error(JSON.stringify({ event: 'unmapped_cart_failure', reason: result.reason }));
      return res.status(500).json({ error: 'Could not add item to cart' });
    }
    return res.status(failure.status).json({ error: failure.error });
  }
  res.json({ items: result.items, total: cartTotal(req.params.cartId) });
});

app.delete('/api/cart/:cartId/items/:productId', (req, res) => {
  const cart = removeFromCart(req.params.cartId, req.params.productId);
  res.json({ items: cart, total: cartTotal(req.params.cartId) });
});

// Intentionally simple fault-injection endpoint so the SRE Agent demo has
// something real to alert on and investigate.
app.get('/api/chaos/error', (req, res) => {
  console.error(JSON.stringify({ event: 'chaos_error_triggered' }));
  res.status(500).json({ error: 'Simulated failure for SRE Agent demo' });
});

// True only when this file is the process entry point, so tests can import the
// app and bind a port of their own. Node resolves symlinks for
// import.meta.url but not for argv[1], so resolve argv[1] the same way.
// Without this, a symlinked checkout starts the server and never listens.
function startedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return import.meta.url === pathToFileURL(entry).href;
  }
}

if (startedDirectly()) {
  app.listen(port, () => {
    console.log(`gh-factory-api listening on port ${port}`);
  });
}

export { app };
