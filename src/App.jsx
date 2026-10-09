import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout, { Toasts } from './components/Layout.jsx';
import { Loading } from './components/Ui.jsx';
import { useShop } from './context/ShopContext.jsx';
import { AddressForm, Addresses, ForgotPassword, Login, Profile, Register, RequireAuth, ResetPassword, Wishlist } from './pages/Account.jsx';
import { Cart, Checkout } from './pages/Cart.jsx';
import { OrderDetail, Orders } from './pages/Orders.jsx';
import { Categories, Home, NotFound, ProductPage, Products, StaticPage, Store } from './pages/Shop.jsx';

// The admin panel is loaded only when an admin opens it (keeps the shop fast for customers).
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

export default function App() {
  const { ready } = useShop();
  if (!ready) return <Loading />;
  const auth = (el) => <RequireAuth>{el}</RequireAuth>;

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/admin/*" element={<AdminApp />} />
        <Route element={<><Layout /><Toasts /></>}>
          <Route index element={<Home />} />
          <Route path="products" element={<Products />} />
          <Route path="products/:slug" element={<ProductPage />} />
          <Route path="search" element={<Products />} />
          <Route path="categories" element={<Categories />} />
          <Route path="category/:slug" element={<Products />} />
          <Route path="pages/:page" element={<StaticPage />} />
          <Route path="store" element={<Store />} />
          <Route path="cart" element={<Cart />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route path="checkout" element={auth(<Checkout />)} />
          <Route path="orders" element={auth(<Orders />)} />
          <Route path="orders/:id" element={auth(<OrderDetail />)} />
          <Route path="profile" element={auth(<Profile />)} />
          <Route path="addresses" element={auth(<Addresses />)} />
          <Route path="addresses/new" element={auth(<AddressForm />)} />
          <Route path="addresses/:id/edit" element={auth(<AddressForm />)} />
          <Route path="wishlist" element={auth(<Wishlist />)} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
