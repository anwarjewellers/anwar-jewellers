import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Toasts } from '../components/Layout.jsx';
import { Loading } from '../components/Ui.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { setTitle } from '../format.js';

const NAV = [
  ['/admin', 'bi-speedometer2', 'Dashboard', true],
  ['/admin/orders', 'bi-receipt', 'Orders'],
  ['/admin/products', 'bi-gem', 'Products'],
  ['/admin/categories', 'bi-tags', 'Categories'],
  ['/admin/inventory', 'bi-box-seam', 'Inventory'],
  ['/admin/customers', 'bi-people', 'Customers'],
  ['/admin/sales', 'bi-graph-up', 'Sales'],
  ['/admin/settings', 'bi-gear', 'Settings'],
];

export function useAdminTitle(title) {
  const { settings } = useShop();
  useEffect(() => { setTitle(`${title} · Admin`, settings.shop_name); }, [title, settings.shop_name]);
}

export default function AdminLayout() {
  const { user, ready, settings, logout } = useShop();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [location.pathname]);

  if (!ready) return <Loading />;
  if (!user?.isAdmin) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;

  const current = NAV.find(([to, , , end]) => (end ? location.pathname === to : location.pathname.startsWith(to)));
  return (
    <div className="admin-wrap">
      {open && <div className="offcanvas-backdrop fade show d-lg-none" onClick={() => setOpen(false)} />}
      <aside className={`admin-sidebar offcanvas-lg offcanvas-start ${open ? 'show' : ''}`} style={open ? { visibility: 'visible' } : undefined}>
        <Link className="admin-brand" to="/admin"><i className="bi bi-gem" /> {settings.shop_name}<small>ADMIN PANEL</small></Link>
        <nav className="nav flex-column py-2">
          {NAV.map(([to, icon, label, end]) => (
            <NavLink key={to} to={to} end={end} className="nav-link"><i className={`bi ${icon}`} /> {label}</NavLink>
          ))}
          <hr className="mx-3" />
          <Link to="/" className="nav-link" target="_blank"><i className="bi bi-box-arrow-up-right" /> View website</Link>
          <button className="nav-link btn btn-link text-start" onClick={logout}><i className="bi bi-box-arrow-right" /> Logout</button>
        </nav>
      </aside>
      <div className="admin-main">
        <div className="admin-topbar">
          <button className="btn btn-dark d-lg-none" onClick={() => setOpen(true)} aria-label="Menu"><i className="bi bi-list" /></button>
          <h1 className="h5 mb-0">{current?.[2] || 'Admin'}</h1>
          <span className="ms-auto small text-muted d-none d-sm-inline">{user.name}</span>
        </div>
        <div className="admin-content"><Outlet /></div>
      </div>
      <Toasts />
    </div>
  );
}

export function AdminLogin() {
  const { user, setUser, refresh, settings } = useShop();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTitle('Admin login', settings.shop_name); }, [settings.shop_name]);
  if (user?.isAdmin) return <Navigate to={location.state?.from || '/admin'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { user: u } = await api('/auth/login', { method: 'POST', body: { ...values, adminOnly: true } });
      setUser(u);
      await refresh();
      navigate(location.state?.from || '/admin', { replace: true });
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <div className="admin-login">
      <div className="card admin-login-card" style={{ width: '100%', maxWidth: 400 }}>
        <div className="card-body p-4">
          <div className="text-center mb-3"><i className="bi bi-gem login-gem" /><h1 className="h4 admin-title mt-2">{settings.shop_name}</h1><p className="small text-muted mb-0">Admin panel</p></div>
          {error && <div className="alert alert-danger small">{error}</div>}
          <form onSubmit={submit}>
            <div className="mb-3"><label className="form-label">Email</label><input className="form-control" type="email" autoComplete="username" required value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} /></div>
            <div className="mb-3"><label className="form-label">Password</label><input className="form-control" type="password" autoComplete="current-password" required value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} /></div>
            <button className="btn btn-gold w-100" disabled={busy}>{busy ? 'Please wait…' : 'Login'}</button>
          </form>
          <p className="text-center small mt-3 mb-0"><Link to="/">← Back to website</Link></p>
        </div>
      </div>
    </div>
  );
}
