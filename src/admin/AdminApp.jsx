import { Route, Routes } from 'react-router-dom';
import '../styles/admin.css';
import AdminLayout, { AdminLogin } from './AdminLayout.jsx';
import { Customers, Dashboard, Inventory } from './Dashboard.jsx';
import { OrderDetail, OrderList } from './Orders.jsx';
import { Categories, ProductForm, ProductList } from './Products.jsx';
import { Sales, Settings } from './Sales.jsx';

export default function AdminApp() {
  return (
    <Routes>
      <Route path="login" element={<AdminLogin />} />
      <Route element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<OrderList />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="products" element={<ProductList />} />
        <Route path="products/new" element={<ProductForm />} />
        <Route path="products/:id" element={<ProductForm />} />
        <Route path="categories" element={<Categories />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="customers" element={<Customers />} />
        <Route path="sales" element={<Sales />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<p className="text-muted">Page not found.</p>} />
      </Route>
    </Routes>
  );
}
