export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  image: string;
  description: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface CartResponse {
  items: CartItem[];
  total: number;
}
