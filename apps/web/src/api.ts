import type { CartResponse, Product } from './types';

// Baked in at build time (Docker build-arg / GitHub Actions), falls back to
// same-origin "/api" for local dev via the Vite proxy.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`Request to ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listProducts: () => request<Product[]>('/products'),
  getCart: (cartId: string) => request<CartResponse>(`/cart/${cartId}`),
  addToCart: (cartId: string, productId: string, quantity = 1) =>
    request<CartResponse>(`/cart/${cartId}/items`, {
      method: 'POST',
      body: JSON.stringify({ productId, quantity }),
    }),
  removeFromCart: (cartId: string, productId: string) =>
    request<CartResponse>(`/cart/${cartId}/items/${productId}`, { method: 'DELETE' }),
};
