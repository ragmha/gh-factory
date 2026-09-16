import { useEffect, useState } from 'react';
import './App.css';
import { api } from './api';
import type { CartItem, Product } from './types';

function getCartId(): string {
  const key = 'gh-factory-cart-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export default function App() {
  const cartId = getCartId();
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<CartItem[]>([]);
  const [total, setTotal] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshCart() {
    const cart = await api.getCart(cartId);
    setItems(cart.items);
    setTotal(cart.total);
  }

  useEffect(() => {
    api
      .listProducts()
      .then(setProducts)
      .catch(() => setError('Could not reach the API. Is it running?'));
    refreshCart().catch(() => setError('Could not reach the API. Is it running?'));
  }, []);

  async function handleAdd(productId: string) {
    try {
      const cart = await api.addToCart(cartId, productId, 1);
      setItems(cart.items);
      setTotal(cart.total);
      setCartOpen(true);
      setError(null);
    } catch {
      setError('Failed to add item to cart.');
    }
  }

  async function handleRemove(productId: string) {
    const cart = await api.removeFromCart(cartId, productId);
    setItems(cart.items);
    setTotal(cart.total);
  }

  const itemCount = items.reduce((n, i) => n + i.quantity, 0);

  return (
    <>
      <header className="app-header">
        <h1>🛒 gh-factory shop</h1>
        <button className="cart-button" onClick={() => setCartOpen((v) => !v)}>
          Cart ({itemCount})
        </button>
      </header>

      {error && <div className="status-banner">{error}</div>}

      <main className="product-grid">
        {products.map((p) => (
          <article className="product-card" key={p.id}>
            <img src={p.image} alt={p.name} loading="lazy" />
            <div className="product-card-body">
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              <span className="price">${p.price.toFixed(2)}</span>
              <button className="add-button" onClick={() => handleAdd(p.id)}>
                Add to cart
              </button>
            </div>
          </article>
        ))}
      </main>

      {cartOpen && (
        <aside className="cart-drawer">
          <h2>Your cart</h2>
          {items.length === 0 && <p>Your cart is empty.</p>}
          {items.map((item) => {
            const product = products.find((p) => p.id === item.productId);
            if (!product) return null;
            return (
              <div className="cart-line" key={item.productId}>
                <span>
                  {product.name} × {item.quantity}
                </span>
                <button className="remove-link" onClick={() => handleRemove(item.productId)}>
                  remove
                </button>
              </div>
            );
          })}
          <div className="cart-total">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </aside>
      )}
    </>
  );
}
