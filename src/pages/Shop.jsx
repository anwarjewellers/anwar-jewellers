import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MAX_PER_ITEM, PAGES, PRICE_RANGES, SORT_OPTIONS } from '../../shared/constants.js';
import { ProductGrid } from '../components/ProductCard.jsx';
import { Empty, ErrorBox, Loading, Pagination } from '../components/Ui.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { discountPercent, hasDiscount, imageUrl, inr, setTitle } from '../format.js';
import { useApi } from '../hooks.js';
import '../styles/store.css';

export function Home() {
  const { settings } = useShop();
  const { data, error, loading, reload } = useApi('/home');
  useEffect(() => { setTitle(null, settings.shop_name && `${settings.shop_name} – ${settings.tagline}`); }, [settings]);

  const heroStyle = settings.hero_image_key ? { '--hero-img': `url('${imageUrl(settings.hero_image_key)}')` } : undefined;
  const sections = data ? [
    ['New Arrivals', data.newArrivals, '/products?sort=newest'],
    ['Best Sellers', data.bestSellers, '/products?sort=popular'],
    ['Offers', data.offers, '/products?sort=newest'],
  ].filter(([, list]) => list.length) : [];

  return (
    <>
      <section className="hero" style={heroStyle}>
        <div className="container">
          <div className="hero-content">
            <div className="hero-icon"><i className="bi bi-gem" /></div>
            <p className="eyebrow">{settings.shop_name} · {settings.tagline}</p>
            <h1>{settings.hero_title}</h1>
            <div className="gold-rule" />
            <p className="lead">{settings.hero_subtitle}</p>
            <Link to="/products" className="btn btn-gold btn-lg">Shop Now</Link>
          </div>
        </div>
      </section>

      {loading && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}

      {data?.categories.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-head"><h2>Shop by Category</h2><Link to="/categories">View all</Link></div>
            <div className="category-strip">
              {data.categories.map((c) => (
                <Link className="category-tile" to={`/category/${c.slug}`} key={c.id}>
                  <span className="category-img">{c.image_key ? <img src={imageUrl(c.image_key)} alt={c.name} loading="lazy" /> : <span className="initial">{c.name[0]}</span>}</span>
                  <span className="category-name">{c.name}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {sections.map(([heading, list, link], i) => (
        <section className={`section ${i % 2 ? 'section-alt' : ''}`} key={heading}>
          <div className="container">
            <div className="section-head"><h2>{heading}</h2><Link to={link}>View all</Link></div>
            <ProductGrid products={list} />
          </div>
        </section>
      ))}

      {data && !data.newArrivals.length && <section className="section"><div className="container text-center text-muted py-5">New jewellery is coming soon. Please check back!</div></section>}

      <section className="section trust">
        <div className="container">
          <div className="row text-center g-4">
            <div className="col-6 col-md-3"><i className="bi bi-gem" /><p>Handpicked designs</p></div>
            <div className="col-6 col-md-3"><i className="bi bi-shield-check" /><p>Secure payments<br /><small>UPI · Cards · Net Banking</small></p></div>
            <div className="col-6 col-md-3"><i className="bi bi-lightning-charge" /><p>Instant delivery<br /><small>across {settings.delivery_area_name || 'Hyderabad'}</small></p></div>
            <div className="col-6 col-md-3"><i className="bi bi-chat-heart" /><p>Friendly support</p></div>
          </div>
        </div>
      </section>
    </>
  );
}

/** /products, /category/:slug and /search all use this page. */
export function Products() {
  const { slug } = useParams();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const { settings, categories } = useShop();
  const isSearch = pathname === '/search';

  const query = new URLSearchParams(params);
  if (slug) query.set('category', slug);
  const { data, error, loading, reload } = useApi(`/products?${query}`);

  const title = isSearch ? `Search results for "${params.get('q') || ''}"` : data?.category?.name || 'All Jewellery';
  useEffect(() => { setTitle(title, settings.shop_name); }, [title, settings.shop_name]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('page');
    setParams(next);
  };
  const makeHref = (p) => { const n = new URLSearchParams(params); n.set('page', p); return `${pathname}?${n}`; };

  if (slug && error?.status === 404) return <NotFound />;

  return (
    <div className="container py-4">
      <nav aria-label="breadcrumb"><ol className="breadcrumb small"><li className="breadcrumb-item"><Link to="/">Home</Link></li><li className="breadcrumb-item active">{title}</li></ol></nav>
      <div className="d-flex flex-wrap justify-content-between align-items-baseline gap-2">
        <h1 className="page-title mb-2">{title}</h1>
        {data && <span className="small text-muted">{data.total} item{data.total === 1 ? '' : 's'}</span>}
      </div>

      <div className="row g-4">
        <aside className="col-lg-3">
          <div className="filters card-box">
            {!slug && (
              <div className="mb-3">
                <h6>Category</h6>
                <select className="form-select form-select-sm" value={params.get('category') || ''} onChange={(e) => setFilter('category', e.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div className="mb-3">
              <h6>Price</h6>
              {[['', 'Any price'], ...Object.entries(PRICE_RANGES).map(([k, r]) => [k, r.label])].map(([k, label]) => (
                <div className="form-check" key={k || 'any'}>
                  <input className="form-check-input" type="radio" id={`price-${k || 'any'}`} checked={(params.get('price') || '') === k} onChange={() => setFilter('price', k)} />
                  <label className="form-check-label small" htmlFor={`price-${k || 'any'}`}>{label}</label>
                </div>
              ))}
            </div>
            <div className="mb-3">
              <h6>Availability</h6>
              <select className="form-select form-select-sm" value={params.get('availability') || ''} onChange={(e) => setFilter('availability', e.target.value)}>
                <option value="">All</option><option value="in">In stock</option><option value="out">Out of stock</option>
              </select>
            </div>
            <div>
              <h6>Sort by</h6>
              <select className="form-select form-select-sm" value={params.get('sort') || 'newest'} onChange={(e) => setFilter('sort', e.target.value === 'newest' ? '' : e.target.value)}>
                {Object.entries(SORT_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
        </aside>
        <div className="col-lg-9">
          {loading && !data && <Loading />}
          {error && <ErrorBox error={error} onRetry={reload} />}
          {data && (data.products.length ? (
            <>
              <ProductGrid products={data.products} />
              <Pagination page={data.page} lastPage={data.lastPage} makeHref={makeHref} />
            </>
          ) : (
            <Empty icon="bi-search" title="No jewellery found">
              <p>Try a different search or remove some filters.</p>
              <Link className="btn btn-outline-gold" to="/products">See all jewellery</Link>
            </Empty>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Categories() {
  const { settings } = useShop();
  const { data, error, loading, reload } = useApi('/categories');
  useEffect(() => { setTitle('Categories', settings.shop_name); }, [settings.shop_name]);
  return (
    <div className="container py-4">
      <h1 className="page-title">Shop by Category</h1>
      {loading && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      <div className="row row-cols-2 row-cols-md-3 row-cols-lg-4 g-3">
        {data?.categories.map((c) => (
          <div className="col" key={c.id}>
            <Link className="category-card" to={`/category/${c.slug}`}>
              <span className="category-img lg">{c.image_key ? <img src={imageUrl(c.image_key)} alt={c.name} loading="lazy" /> : <span className="initial">{c.name[0]}</span>}</span>
              <span className="category-name">{c.name}</span>
              <span className="small text-muted">{c.product_count} item{c.product_count === 1 ? '' : 's'}</span>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { settings, wishlist, toggleWishlist, addToCart } = useShop();
  const { data, error, loading, reload } = useApi(`/products/${encodeURIComponent(slug)}`);
  const [active, setActive] = useState(0);
  const [qty, setQty] = useState(1);

  useEffect(() => { setActive(0); setQty(1); }, [slug]);
  useEffect(() => {
    if (!data) return;
    const p = data.product;
    setTitle(p.name, settings.shop_name);
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', p.meta_description || p.name);
  }, [data, settings.shop_name]);

  if (loading) return <Loading />;
  if (error?.status === 404) return <NotFound />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const p = data.product;
  const images = p.images.length ? p.images : [{ id: 0, image_key: null, thumb_key: null }];
  const inStock = p.stock_quantity > 0;
  const max = Math.min(p.stock_quantity, MAX_PER_ITEM);
  const wished = wishlist.includes(p.id);

  return (
    <div className="container py-4">
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item"><Link to="/">Home</Link></li>
          <li className="breadcrumb-item"><Link to={`/category/${p.category_slug}`}>{p.category_name}</Link></li>
          <li className="breadcrumb-item active">{p.name}</li>
        </ol>
      </nav>

      <div className="row g-4 g-lg-5">
        <div className="col-lg-6">
          <div className="gallery-main">
            <img src={imageUrl(images[active]?.image_key)} alt={p.name} />
            {hasDiscount(p) && <span className="badge-off">{discountPercent(p)}% OFF</span>}
          </div>
          {images.length > 1 && (
            <div className="gallery-thumbs">
              {images.map((img, i) => (
                <button type="button" key={img.id} className={`thumb ${i === active ? 'active' : ''}`} onClick={() => setActive(i)} aria-label={`Image ${i + 1}`}>
                  <img src={imageUrl(img.thumb_key || img.image_key)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="col-lg-6">
          <p className="text-gold small text-uppercase mb-1">{p.category_name}</p>
          <h1 className="product-title">{p.name}</h1>
          <div className="price-row big my-3">
            <span className="price">{inr(p.price)}</span>
            {hasDiscount(p) && <><span className="mrp">MRP: {inr(p.original_price)}</span><span className="off">{discountPercent(p)}% OFF</span></>}
          </div>
          <p className="small text-muted">Inclusive of all taxes</p>

          <table className="table table-sm spec-table">
            <tbody>
              <tr><th>Type</th><td>{p.category_name}</td></tr>
              {p.material && <tr><th>Material</th><td>{p.material}</td></tr>}
              {p.colour && <tr><th>Colour</th><td>{p.colour}</td></tr>}
              {p.size && <tr><th>Size</th><td>{p.size}</td></tr>}
              {p.weight && <tr><th>Weight</th><td>{p.weight}</td></tr>}
              <tr><th>Availability</th><td>
                {inStock ? <><span className="text-success fw-semibold">In Stock</span>{p.stock_quantity <= 5 && <span className="text-danger small"> (only {p.stock_quantity} left)</span>}</> : <span className="text-danger fw-semibold">Out of Stock</span>}
              </td></tr>
            </tbody>
          </table>

          {inStock ? (
            <div className="buy-box">
              <div className="qty-selector">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease">−</button>
                <input type="number" value={qty} min="1" max={max} onChange={(e) => setQty(Math.max(1, Math.min(max, parseInt(e.target.value, 10) || 1)))} aria-label="Quantity" />
                <button type="button" onClick={() => setQty((q) => Math.min(max, q + 1))} aria-label="Increase">+</button>
              </div>
              <button className="btn btn-outline-gold flex-grow-1" onClick={() => addToCart(p, qty)}><i className="bi bi-bag-plus" /> Add to Cart</button>
              <button className="btn btn-gold flex-grow-1" onClick={() => { if (addToCart(p, qty)) navigate('/cart'); }}>Buy Now</button>
            </div>
          ) : (
            <button className="btn btn-secondary w-100" disabled>Out of Stock</button>
          )}

          <button className={`btn btn-link p-0 mt-3 ${wished ? 'text-danger' : 'text-reset'}`} onClick={() => toggleWishlist(p)}>
            <i className={`bi ${wished ? 'bi-heart-fill' : 'bi-heart'}`} /> {wished ? 'In your wishlist (remove)' : 'Add to Wishlist'}
          </button>

          {p.description && (
            <div className="mt-4">
              <h2 className="h6 text-uppercase">Description</h2>
              <div className="text-body-secondary" style={{ whiteSpace: 'pre-line' }}>{p.description}</div>
            </div>
          )}

          <ul className="list-unstyled small text-muted mt-4">
            <li><i className="bi bi-shield-check text-gold" /> Secure payment: UPI, cards, net banking</li>
            <li><i className="bi bi-lightning-charge text-gold" /> Instant delivery across {settings.delivery_area_name || 'Hyderabad'} by Borzo</li>
            <li><i className="bi bi-arrow-repeat text-gold" /> <Link to="/pages/returns">Return policy</Link></li>
          </ul>
        </div>
      </div>

      {data.related.length > 0 && (
        <section className="mt-5">
          <div className="section-head"><h2>You may also like</h2></div>
          <ProductGrid products={data.related} />
        </section>
      )}
    </div>
  );
}

export function StaticPage() {
  const { page } = useParams();
  const { settings: s } = useShop();
  const info = PAGES[page];
  useEffect(() => { setTitle(info?.title || 'Page not found', s.shop_name); }, [info, s.shop_name]);
  if (!info) return <NotFound />;
  return (
    <div className="container py-4" style={{ maxWidth: 820 }}>
      <h1 className="page-title">{info.title}</h1>
      {page === 'contact' ? (
        <div className="card-box page-content">
          <p>We would love to hear from you.</p>
          {s.shop_address && <p><i className="bi bi-geo-alt text-gold" /> {s.shop_address} · <Link to="/store">View on map</Link></p>}
          {s.contact_phone && <p><i className="bi bi-telephone text-gold" /> <a href={`tel:${s.contact_phone.replace(/\s/g, '')}`}>{s.contact_phone}</a></p>}
          {s.whatsapp_number && <p><i className="bi bi-whatsapp text-gold" /> <a href={`https://wa.me/${s.whatsapp_number}`} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a></p>}
          {s.contact_email && <p><i className="bi bi-envelope text-gold" /> General: <a href={`mailto:${s.contact_email}`}>{s.contact_email}</a></p>}
          {s.support_email && <p><i className="bi bi-headset text-gold" /> Customer support (orders, returns, delivery): <a href={`mailto:${s.support_email}`}>{s.support_email}</a></p>}
          {s.sales_email && <p><i className="bi bi-gem text-gold" /> Retail enquiries: <a href={`mailto:${s.sales_email}`}>{s.sales_email}</a></p>}
        </div>
      ) : (
        <div className="card-box page-content" style={{ whiteSpace: 'pre-line' }}>{s[info.setting]}</div>
      )}
    </div>
  );
}

const mapsQuery = (s) => (s.store_map_query || `${s.shop_name}, ${s.shop_address}`).trim();

export function Store() {
  const { settings: s } = useShop();
  useEffect(() => { setTitle('Our Store', s.shop_name); }, [s.shop_name]);
  const q = encodeURIComponent(mapsQuery(s));
  const pin = (s.shop_address || '').match(/\b\d{6}\b/)?.[0];
  return (
    <div className="container py-4">
      <h1 className="page-title">Our Store</h1>
      <nav className="small text-muted mb-3"><Link to="/">Home</Link> / <span className="text-gold">Store</span></nav>
      <p className="mb-3">Visit our showroom in {s.delivery_area_name || 'Hyderabad'} to see the full collection in person. We also deliver across {s.delivery_area_name || 'Hyderabad'}.</p>

      <div className="store-map mb-3">
        <iframe
          title={`${s.shop_name} location`}
          src={`https://maps.google.com/maps?q=${q}&z=16&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
        <a className="store-map-open" href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener noreferrer">
          Open in Maps <i className="bi bi-box-arrow-up-right" />
        </a>
      </div>

      <div className="card-box store-card">
        <div className="store-icon"><i className="bi bi-shop" /></div>
        <div className="flex-grow-1">
          <h2 className="h5 mb-1">{s.shop_name}</h2>
          {s.shop_address && <p className="mb-1 text-muted">{s.shop_address}</p>}
          {s.contact_phone && <p className="mb-2"><i className="bi bi-telephone text-gold" /> <a href={`tel:${s.contact_phone.replace(/\s/g, '')}`}>{s.contact_phone}</a></p>}
          <div className="d-flex flex-wrap gap-2">
            {s.store_hours && <span className="store-chip"><i className="bi bi-clock" /> {s.store_hours}</span>}
            {s.tagline && <span className="store-chip">{s.tagline}</span>}
            <span className="store-chip">Home delivery in {s.delivery_area_name || 'Hyderabad'}</span>
          </div>
        </div>
        <div className="store-actions">
          {pin && <div className="text-end mb-2"><strong>PIN {pin}</strong><div className="small text-muted">{s.delivery_area_name || 'Hyderabad'}</div></div>}
          <a className="btn btn-gold btn-sm w-100 mb-2" href={`https://www.google.com/maps/dir/?api=1&destination=${q}`} target="_blank" rel="noopener noreferrer"><i className="bi bi-sign-turn-right" /> Get Directions</a>
          {s.whatsapp_number && <a className="btn btn-outline-gold btn-sm w-100" href={`https://wa.me/${s.whatsapp_number}`} target="_blank" rel="noopener noreferrer"><i className="bi bi-whatsapp" /> WhatsApp us</a>}
        </div>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="container py-5">
      <Empty icon="bi-gem" title="Page not found">
        <p>The page you are looking for does not exist or has moved.</p>
        <Link className="btn btn-gold" to="/">Go to home page</Link>
      </Empty>
    </div>
  );
}
