import express from 'express';
import cors from 'cors';
import { products } from './products.js';
import { getCart, addToCart, removeFromCart, cartTotal } from './cart.js';

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

app.post('/api/cart/:cartId/items', (req, res) => {
  const { productId, quantity } = req.body || {};
  if (!productId) return res.status(400).json({ error: 'productId is required' });

  const result = addToCart(req.params.cartId, productId, quantity);
  if (!result.ok) {
    if (result.reason === 'product_not_found') {
      return res.status(404).json({ error: 'Product not found' });
    }
    return res.status(400).json({ error: 'quantity must be a positive integer' });
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

app.listen(port, () => {
  console.log(`gh-factory-api listening on port ${port}`);
});
