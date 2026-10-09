import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAX_PER_ITEM } from '../../shared/constants.js';
import { api } from '../api.js';

const ShopContext = createContext(null);
export const useShop = () => useContext(ShopContext);

const CART_KEY = 'cart.v1';

function readCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function ShopProvider({ children }) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState({});
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [cart, setCart] = useState(readCart); // { productId: quantity }
  const [toasts, setToasts] = useState([]);

  const refresh = useCallback(async () => {
    const data = await api('/bootstrap');
    setSettings(data.settings);
    setUser(data.user);
    setCategories(data.categories);
    setWishlist(data.wishlist);
    return data;
  }, []);

  useEffect(() => {
    refresh().catch(() => {}).finally(() => setReady(true));
  }, [refresh]);

  // Keep the cart in this browser, and in sync across tabs.
  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* private mode */ }
  }, [cart]);
  useEffect(() => {
    const onStorage = (e) => { if (e.key === CART_KEY) setCart(readCart()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const notify = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  const addToCart = useCallback((product, quantity = 1) => {
    if (product.stock_quantity <= 0) { notify('Product is out of stock.', 'danger'); return false; }
    const current = cart[product.id] || 0;
    const next = Math.min(current + quantity, product.stock_quantity, MAX_PER_ITEM);
    if (next === current) {
      notify('You already have the maximum available quantity in your cart.', 'warning');
      return current > 0;
    }
    setCart((c) => ({ ...c, [product.id]: next }));
    notify(`${product.name} added to your cart.`);
    return true;
  }, [cart, notify]);

  const setCartQuantity = useCallback((productId, quantity) => {
    setCart((c) => {
      const next = { ...c };
      if (quantity <= 0) delete next[productId];
      else next[productId] = Math.min(quantity, MAX_PER_ITEM);
      return next;
    });
  }, []);

  const clearCart = useCallback(() => setCart({}), []);
  const cartItems = useMemo(() => Object.entries(cart).map(([productId, quantity]) => ({ productId: Number(productId), quantity })), [cart]);
  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);

  const toggleWishlist = useCallback(async (product) => {
    if (!user) {
      notify('Please log in to save items to your wishlist.', 'warning');
      navigate('/login', { state: { from: window.location.pathname } });
      return;
    }
    const inList = wishlist.includes(product.id);
    try {
      const res = await api(`/wishlist/${product.id}`, { method: inList ? 'DELETE' : 'POST' });
      setWishlist((w) => (inList ? w.filter((id) => id !== product.id) : [...w, product.id]));
      notify(res.message);
    } catch (e) {
      notify(e.message, 'danger');
    }
  }, [user, wishlist, notify, navigate]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    import('../firebase.js').then((f) => f.firebaseSignOut()).catch(() => {});
    setUser(null);
    setWishlist([]);
    navigate('/');
    notify('You have been logged out.');
  }, [navigate, notify]);

  const value = {
    ready, settings, user, setUser, categories, wishlist, setWishlist, refresh,
    cart, cartItems, cartCount, addToCart, setCartQuantity, clearCart,
    toggleWishlist, logout, notify, toasts, dismiss,
  };
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}
