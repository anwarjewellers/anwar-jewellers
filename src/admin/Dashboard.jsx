import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Badge, ErrorBox, Loading, Pagination } from '../components/Ui.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { dateOnly, dateTime, inr, orderStatus, paymentStatus } from '../format.js';
import { useApi } from '../hooks.js';
import { useAdminTitle } from './AdminLayout.jsx';

export function Stat({ icon, label, value, tone = '' }) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-icon"><i className={`bi ${icon}`} /></div>
      <div><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>
    </div>
  );
}

/** Simple responsive bar chart (no chart library needed). */
export function BarChart({ data }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 100 / data.length;
  return (
    <div>
      <div className="small mb-2" style={{ minHeight: 20 }}>
        {hover !== null ? <><span className="text-muted">{data[hover].label}:</span> <strong className="text-gold">{inr(data[hover].value)}</strong></> : <span className="text-muted">Tap or hover a bar to see the amount</span>}
      </div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: '100%', height: 180, display: 'block' }} role="img" aria-label="Sales chart">
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2="100" y1={40 - g * 38} y2={40 - g * 38} stroke="#2e2a22" strokeWidth="0.15" />)}
        {data.map((d, i) => {
          const h = (d.value / max) * 38;
          return (
            <rect key={i} x={i * W + W * 0.15} width={W * 0.7} y={40 - Math.max(h, d.value ? 0.4 : 0.15)} height={Math.max(h, d.value ? 0.4 : 0.15)}
              fill={hover === i ? '#f0d68f' : '#c9a24a'} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} style={{ cursor: 'pointer' }}>
              <title>{`${d.label}: ${inr(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="d-flex justify-content-between small text-muted mt-1"><span>{data[0]?.label}</span><span>{data[data.length - 1]?.label}</span></div>
    </div>
  );
}

export function Dashboard() {
  useAdminTitle('Dashboard');
  const { data, error, loading, reload } = useApi('/admin/dashboard');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { sales, counts, stock, recent, lowStock, chart } = data;

  return (
    <>
      <div className="row g-3 mb-4">
        <div className="col-6 col-xl-3"><Stat icon="bi-currency-rupee" label={`Today (${sales.todayOrders} orders)`} value={inr(sales.today)} tone="gold" /></div>
        <div className="col-6 col-xl-3"><Stat icon="bi-calendar-week" label="This week" value={inr(sales.week)} /></div>
        <div className="col-6 col-xl-3"><Stat icon="bi-calendar3" label={`This month (${sales.monthOrders} orders)`} value={inr(sales.month)} /></div>
        <div className="col-6 col-xl-3"><Stat icon="bi-graph-up-arrow" label="This year" value={inr(sales.year)} /></div>
        <div className="col-6 col-xl-3"><Link to="/admin/orders?status=pending_work" className="text-reset"><Stat icon="bi-hourglass-split" label="Orders to handle" value={counts.pending} tone={counts.pending ? 'warn' : ''} /></Link></div>
        <div className="col-6 col-xl-3"><Stat icon="bi-check2-circle" label="Delivered" value={counts.delivered} tone="ok" /></div>
        <div className="col-6 col-xl-3"><Link to="/admin/inventory?filter=out" className="text-reset"><Stat icon="bi-x-octagon" label="Out of stock" value={stock.out} tone={stock.out ? 'bad' : ''} /></Link></div>
        <div className="col-6 col-xl-3"><Link to="/admin/inventory?filter=low" className="text-reset"><Stat icon="bi-exclamation-triangle" label={`Low stock (≤ ${stock.threshold})`} value={stock.low} tone={stock.low ? 'warn' : ''} /></Link></div>
      </div>

      <div className="card mb-4">
        <div className="card-header"><strong>Sales – last 30 days</strong></div>
        <div className="card-body"><BarChart data={chart} /></div>
      </div>

      <div className="row g-4">
        <div className="col-xl-8">
          <div className="card">
            <div className="card-header d-flex justify-content-between"><strong>Recent orders</strong><Link to="/admin/orders" className="small">View all</Link></div>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
                <tbody>
                  {recent.map((o) => (
                    <tr key={o.id}>
                      <td><Link to={`/admin/orders/${o.id}`}>{o.order_number}</Link><div className="small text-muted">{dateTime(o.created_at)}</div></td>
                      <td>{o.shipping_name}</td><td>{inr(o.total_amount)}</td>
                      <td><Badge info={paymentStatus(o.payment_status)} /></td><td><Badge info={orderStatus(o.order_status)} /></td>
                    </tr>
                  ))}
                  {!recent.length && <tr><td colSpan="5" className="text-muted">No orders yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="col-xl-4">
          <div className="card">
            <div className="card-header d-flex justify-content-between"><strong>Low stock</strong><Link to="/admin/inventory" className="small">Inventory</Link></div>
            <ul className="list-group list-group-flush">
              {lowStock.map((p) => (
                <li className="list-group-item d-flex justify-content-between" key={p.id}>
                  <Link to={`/admin/products/${p.id}`}>{p.name}</Link>
                  <span className={p.stock_quantity ? 'text-warning' : 'text-danger'}>{p.stock_quantity}</span>
                </li>
              ))}
              {!lowStock.length && <li className="list-group-item text-muted">All products are well stocked.</li>}
            </ul>
          </div>
          <div className="small text-muted mt-3">{counts.customers} customers · {counts.products} products · {counts.cancelled} cancelled orders</div>
        </div>
      </div>
    </>
  );
}

export function Customers() {
  useAdminTitle('Customers');
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useApi(`/admin/customers?${params}`);
  const [q, setQ] = useState(params.get('q') || '');
  return (
    <>
      <form className="d-flex gap-2 mb-3" onSubmit={(e) => { e.preventDefault(); setParams(q ? { q } : {}); }}>
        <input className="form-control" style={{ maxWidth: 320 }} placeholder="Name, email or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-dark">Search</button>
      </form>
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (
        <div className="card">
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Orders</th><th>Spent</th><th>Joined</th></tr></thead>
              <tbody>
                {data.customers.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td><td><a href={`mailto:${u.email}`}>{u.email}</a></td><td>{u.mobile ? <a href={`tel:${u.mobile}`}>{u.mobile}</a> : '—'}</td>
                    <td>{u.orders_count ? <Link to={`/admin/orders?q=${encodeURIComponent(u.email)}&status=all`}>{u.orders_count}</Link> : 0}</td>
                    <td>{inr(u.total_spent)}</td><td className="small">{dateOnly(u.created_at)}</td>
                  </tr>
                ))}
                {!data.customers.length && <tr><td colSpan="6" className="text-muted">No customers found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {data && <Pagination page={data.page} lastPage={data.lastPage} makeHref={(p) => { const n = new URLSearchParams(params); n.set('page', p); return `?${n}`; }} />}
    </>
  );
}

export function Inventory() {
  useAdminTitle('Inventory');
  const { notify } = useShop();
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useApi(`/admin/inventory?${params}`);
  const [edits, setEdits] = useState({});

  const save = async (p) => {
    try {
      notify((await api(`/admin/inventory/${p.id}`, { method: 'PATCH', body: { stock_quantity: edits[p.id] } })).message);
      setEdits((e) => { const n = { ...e }; delete n[p.id]; return n; });
      reload();
    } catch (e) { notify(e.message, 'danger'); }
  };

  const tab = params.get('filter') || '';
  return (
    <>
      <ul className="nav nav-pills mb-3 gap-1">
        {[['', 'All'], ['low', 'Low stock'], ['out', 'Out of stock']].map(([k, label]) => (
          <li className="nav-item" key={k}><button className={`btn btn-sm ${tab === k ? 'btn-gold' : 'btn-outline-dark'}`} onClick={() => setParams(k ? { filter: k } : {})}>{label}</button></li>
        ))}
      </ul>
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (
        <div className="card">
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead><tr><th>Product</th><th>Category</th><th>Status</th><th style={{ width: 230 }}>Stock</th></tr></thead>
              <tbody>
                {data.products.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={`/admin/products/${p.id}`}>{p.name}</Link></td>
                    <td className="small">{p.category_name}</td>
                    <td><span className={`badge text-bg-${p.status === 'active' ? 'success' : 'secondary'}`}>{p.status}</span></td>
                    <td>
                      <form className="input-group input-group-sm" onSubmit={(e) => { e.preventDefault(); save(p); }}>
                        <input type="number" min="0" className={`form-control ${p.stock_quantity === 0 ? 'border-danger' : p.stock_quantity <= data.threshold ? 'border-warning' : ''}`}
                          value={edits[p.id] ?? p.stock_quantity} onChange={(e) => setEdits({ ...edits, [p.id]: e.target.value })} />
                        <button className="btn btn-dark" disabled={edits[p.id] === undefined || String(edits[p.id]) === String(p.stock_quantity)}>Save</button>
                      </form>
                    </td>
                  </tr>
                ))}
                {!data.products.length && <tr><td colSpan="4" className="text-muted">Nothing here.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
