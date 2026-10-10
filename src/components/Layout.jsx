import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PAGES } from '../../shared/constants.js';
import { useShop } from '../context/ShopContext.jsx';
import { imageUrl, initials } from '../format.js';

export function Toasts() {
  const { toasts, dismiss } = useShop();
  return (
    <div className="toast-container position-fixed bottom-0 end-0 p-3" style={{ zIndex: 2000 }}>
      {toasts.map((t) => (
        <div key={t.id} className={`toast show align-items-center text-bg-${t.type} border-0`} role="status">
          <div className="d-flex">
            <div className="toast-body">{t.message}</div>
            <button type="button" className="btn-close btn-close-white me-2 m-auto" aria-label="Close" onClick={() => dismiss(t.id)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SearchBox({ className, onDone }) {
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const navigate = useNavigate();
  return (
    <form className={`header-search ${className}`} role="search" onSubmit={(e) => { e.preventDefault(); navigate(`/search?q=${encodeURIComponent(q.trim())}`); onDone?.(); }}>
      <input className="form-control" type="search" placeholder="Search jewellery…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      <button className="btn" type="submit" aria-label="Search"><i className="bi bi-search" /></button>
    </form>
  );
}

function Brand() {
  const { settings } = useShop();
  return (
    <Link className="navbar-brand brand me-auto me-lg-4" to="/">
      {settings.logo_key ? <img src={imageUrl(settings.logo_key)} alt={settings.shop_name} className="brand-logo" /> : <span className="brand-mark">{initials(settings.shop_name)}</span>}
      <span>{settings.shop_name}</span>
    </Link>
  );
}

function Header() {
  const { settings, user, categories, cartCount, wishlist, logout } = useShop();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dropdown, setDropdown] = useState(null);
  const location = useLocation();
  const headerRef = useRef(null);

  useEffect(() => { setMenuOpen(false); setDropdown(null); setSearchOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    const close = (e) => { if (headerRef.current && !headerRef.current.contains(e.target)) setDropdown(null); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  return (
    <>
      <div className="topbar d-none d-md-block">
        <div className="container d-flex justify-content-between">
          <span><i className="bi bi-lightning-charge" /> Instant delivery across {settings.delivery_area_name || 'Hyderabad'} · Secure online payment</span>
          {settings.contact_phone && <span><i className="bi bi-telephone" /> {settings.contact_phone}</span>}
        </div>
      </div>

      <header className="site-header sticky-top" ref={headerRef}>
        <nav className="navbar navbar-expand-lg">
          <div className="container gap-2">
            <button className="navbar-toggler border-0 px-1" type="button" onClick={() => setMenuOpen(true)} aria-label="Menu"><i className="bi bi-list fs-3" /></button>
            <Brand />

            <ul className="navbar-nav d-none d-lg-flex me-auto">
              <li className="nav-item"><NavLink end className="nav-link" to="/">Home</NavLink></li>
              <li className="nav-item"><NavLink end className="nav-link" to="/products">Jewellery</NavLink></li>
              <li className="nav-item dropdown">
                <button className="nav-link dropdown-toggle btn btn-link" onClick={() => setDropdown(dropdown === 'cats' ? null : 'cats')} aria-expanded={dropdown === 'cats'}>Categories</button>
                <ul className={`dropdown-menu ${dropdown === 'cats' ? 'show' : ''}`}>
                  {categories.map((c) => <li key={c.id}><Link className="dropdown-item" to={`/category/${c.slug}`}>{c.name}</Link></li>)}
                  <li><hr className="dropdown-divider" /></li>
                  <li><Link className="dropdown-item" to="/categories">All categories</Link></li>
                </ul>
              </li>
              <li className="nav-item"><Link className="nav-link" to="/products?sort=newest">New Arrivals</Link></li>
              <li className="nav-item"><NavLink className="nav-link" to="/store">Our Store</NavLink></li>
            </ul>

            <SearchBox className="d-none d-lg-flex" />

            <div className="header-icons d-flex align-items-center">
              <button className="icon-btn d-lg-none" type="button" onClick={() => setSearchOpen((v) => !v)} aria-label="Search"><i className="bi bi-search" /></button>
              <Link className="icon-btn" to="/wishlist" aria-label="Wishlist"><i className="bi bi-heart" />{wishlist.length > 0 && <span className="count">{wishlist.length}</span>}</Link>
              <Link className="icon-btn" to="/cart" aria-label="Cart"><i className="bi bi-bag" />{cartCount > 0 && <span className="count">{cartCount}</span>}</Link>
              {user ? (
                <div className="dropdown d-none d-lg-block">
                  <button className="icon-btn" onClick={() => setDropdown(dropdown === 'user' ? null : 'user')} aria-label="Account"><i className="bi bi-person" /></button>
                  <ul className={`dropdown-menu dropdown-menu-end ${dropdown === 'user' ? 'show' : ''}`} style={{ right: 0 }}>
                    <li className="dropdown-header">Hi, {user.name}</li>
                    {user.isAdmin && <li><Link className="dropdown-item" to="/admin">Admin panel</Link></li>}
                    <li><Link className="dropdown-item" to="/orders">My Orders</Link></li>
                    <li><Link className="dropdown-item" to="/profile">My Profile</Link></li>
                    <li><Link className="dropdown-item" to="/addresses">My Addresses</Link></li>
                    <li><hr className="dropdown-divider" /></li>
                    <li><button className="dropdown-item" onClick={logout}>Logout</button></li>
                  </ul>
                </div>
              ) : (
                <Link className="btn btn-gold btn-sm ms-2 d-none d-lg-inline-block" to="/login">Login</Link>
              )}
            </div>
          </div>
        </nav>
        {searchOpen && <div className="d-lg-none"><div className="container pb-2"><SearchBox className="d-flex" /></div></div>}
      </header>

      {menuOpen && <div className="offcanvas-backdrop fade show" onClick={() => setMenuOpen(false)} />}
      <div className={`offcanvas offcanvas-start ${menuOpen ? 'show' : ''}`} style={{ visibility: menuOpen ? 'visible' : 'hidden' }} aria-label="Menu">
        <div className="offcanvas-header">
          <h5 className="offcanvas-title brand">{settings.shop_name}</h5>
          <button type="button" className="btn-close" onClick={() => setMenuOpen(false)} aria-label="Close" />
        </div>
        <div className="offcanvas-body">
          <ul className="list-unstyled mobile-nav">
            <li><Link to="/">Home</Link></li>
            <li><Link to="/products">All Jewellery</Link></li>
            <li><Link to="/products?sort=newest">New Arrivals</Link></li>
            <li><Link to="/store">Our Store</Link></li>
            <li className="mt-2 small text-muted text-uppercase">Categories</li>
            {categories.map((c) => <li key={c.id}><Link to={`/category/${c.slug}`}>{c.name}</Link></li>)}
            <li className="mt-3 small text-muted text-uppercase">Account</li>
            {user ? (
              <>
                {user.isAdmin && <li><Link to="/admin">Admin panel</Link></li>}
                <li><Link to="/orders">My Orders</Link></li>
                <li><Link to="/wishlist">My Wishlist</Link></li>
                <li><Link to="/profile">My Profile</Link></li>
                <li><Link to="/addresses">My Addresses</Link></li>
                <li><button className="btn btn-link p-0 text-danger" onClick={logout}>Logout</button></li>
              </>
            ) : (
              <>
                <li><Link to="/login">Login</Link></li>
                <li><Link to="/register">Create account</Link></li>
              </>
            )}
          </ul>
        </div>
      </div>
    </>
  );
}

function Footer() {
  const { settings: s } = useShop();
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="row g-4">
          <div className="col-12 col-md-4">
            <h5 className="brand text-white">{s.shop_name}</h5>
            <p className="small">{s.tagline}</p>
            <div className="social">
              {s.instagram_url && <a href={s.instagram_url} target="_blank" rel="noopener noreferrer" aria-label="Instagram"><i className="bi bi-instagram" /></a>}
              {s.facebook_url && <a href={s.facebook_url} target="_blank" rel="noopener noreferrer" aria-label="Facebook"><i className="bi bi-facebook" /></a>}
              {s.youtube_url && <a href={s.youtube_url} target="_blank" rel="noopener noreferrer" aria-label="YouTube"><i className="bi bi-youtube" /></a>}
              {s.whatsapp_number && <a href={`https://wa.me/${s.whatsapp_number}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"><i className="bi bi-whatsapp" /></a>}
            </div>
          </div>
          <div className="col-6 col-md-2">
            <h6>Shop</h6>
            <ul className="list-unstyled small">
              <li><Link to="/products">All Jewellery</Link></li>
              <li><Link to="/categories">Categories</Link></li>
              <li><Link to="/products?sort=newest">New Arrivals</Link></li>
              <li><Link to="/store">Our Store</Link></li>
              <li><Link to="/cart">Cart</Link></li>
            </ul>
          </div>
          <div className="col-6 col-md-3">
            <h6>Information</h6>
            <ul className="list-unstyled small">
              {Object.entries(PAGES).map(([slug, p]) => <li key={slug}><Link to={`/pages/${slug}`}>{p.title}</Link></li>)}
            </ul>
          </div>
          <div className="col-12 col-md-3">
            <h6>Contact</h6>
            <ul className="list-unstyled small">
              {s.shop_address && <li><i className="bi bi-geo-alt" /> <Link to="/store">{s.shop_address}</Link></li>}
              {s.contact_phone && <li><i className="bi bi-telephone" /> <a href={`tel:${s.contact_phone.replace(/\s/g, '')}`}>{s.contact_phone}</a></li>}
              {s.contact_email && <li><i className="bi bi-envelope" /> <a href={`mailto:${s.contact_email}`}>{s.contact_email}</a></li>}
              {s.support_email && <li><i className="bi bi-headset" /> Support: <a href={`mailto:${s.support_email}`}>{s.support_email}</a></li>}
              {s.sales_email && <li><i className="bi bi-gem" /> Retail: <a href={`mailto:${s.sales_email}`}>{s.sales_email}</a></li>}
            </ul>
          </div>
        </div>
        <hr />
        <p className="small mb-0 text-center">&copy; {new Date().getFullYear()} {s.shop_name}. All rights reserved.</p>
      </div>
    </footer>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <>
      <Header />
      <main className="site-main"><Outlet /></main>
      <Footer />
    </>
  );
}
