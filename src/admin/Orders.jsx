import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ORDER_STATUS, PAYMENT_STATUS } from '../../shared/constants.js';
import { api } from '../api.js';
import { Badge, ErrorBox, Loading, Pagination } from '../components/Ui.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { dateTime, imageUrl, inr, orderStatus, paymentStatus } from '../format.js';
import { useApi } from '../hooks.js';
import { useAdminTitle } from './AdminLayout.jsx';

export function OrderList() {
  useAdminTitle('Orders');
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useApi(`/admin/orders?${params}`);
  const [q, setQ] = useState(params.get('q') || '');
  const set = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); n.delete('page'); setParams(n); };

  return (
    <>
      <div className="d-flex flex-wrap gap-2 mb-3">
        <form className="d-flex gap-2" onSubmit={(e) => { e.preventDefault(); set('q', q); }}>
          <input className="form-control" placeholder="Order no., name, mobile, email" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-dark">Search</button>
        </form>
        <select className="form-select" style={{ maxWidth: 220 }} value={params.get('status') || ''} onChange={(e) => set('status', e.target.value)}>
          <option value="">All except unpaid</option>
          <option value="pending_work">To handle (paid, not delivered)</option>
          <option value="all">All, including unpaid</option>
          {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 170 }} value={params.get('payment') || ''} onChange={(e) => set('payment', e.target.value)}>
          <option value="">Any payment</option>
          {Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Delivery</th></tr></thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/admin/orders/${o.id}`}>{o.order_number}</Link><div className="small text-muted">{dateTime(o.created_at)}</div></td>
                    <td>{o.shipping_name}<div className="small text-muted">{o.shipping_mobile}</div></td>
                    <td>{inr(o.total_amount)}</td>
                    <td><Badge info={paymentStatus(o.payment_status)} /></td>
                    <td><Badge info={orderStatus(o.order_status)} /></td>
                    <td className="small">{o.delivery_status ? o.delivery_status.replace(/_/g, ' ') : '—'}</td>
                  </tr>
                ))}
                {!data.orders.length && <tr><td colSpan="6" className="text-muted">No orders found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {data && <Pagination page={data.page} lastPage={data.lastPage} makeHref={(p) => { const n = new URLSearchParams(params); n.set('page', p); return `?${n}`; }} />}
    </>
  );
}

const DELIVERY_BADGE = { completed: 'success', canceled: 'danger', active: 'primary' };

export function OrderDetail() {
  const { id } = useParams();
  const { notify } = useShop();
  const { data, error, loading, reload } = useApi(`/admin/orders/${id}`);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [manual, setManual] = useState({});
  const [busy, setBusy] = useState(false);
  useAdminTitle(data ? `Order ${data.order.order_number}` : 'Order');

  useEffect(() => {
    if (!data) return;
    const o = data.order;
    setStatus(o.order_status);
    setNote(o.admin_note || '');
    setManual({ delivery_provider: o.delivery_provider || 'borzo', delivery_tracking_url: o.delivery_tracking_url || '', delivery_courier_name: o.delivery_courier_name || '', delivery_courier_phone: o.delivery_courier_phone || '' });
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { order: o, items, payments, user, statuses, borzoConnected, canBook, riderBooked } = data;
  const paid = o.payment_status === 'paid';

  const run = async (path, method = 'POST', body, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try { notify((await api(`/admin/orders/${o.id}${path}`, { method, body })).message); await reload(); } catch (e) { notify(e.message, 'danger'); }
    setBusy(false);
  };
  const address = [o.shipping_address].join('');

  return (
    <>
      <Link to="/admin/orders" className="small"><i className="bi bi-arrow-left" /> All orders</Link>
      <div className="row g-4 mt-1">
        <div className="col-xl-8">
          <div className="card mb-4">
            <div className="card-header d-flex flex-wrap justify-content-between gap-2"><strong>Order #{o.order_number}</strong><span className="small text-muted">{dateTime(o.created_at)}</span></div>
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead><tr><th>Product</th><th>Price</th><th>Qty</th><th className="text-end">Total</th></tr></thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td className="d-flex align-items-center gap-2"><img src={imageUrl(it.thumb_key)} className="admin-thumb" alt="" /><span>{it.product_id && it.product_exists ? <Link to={`/admin/products/${it.product_id}`}>{it.product_name}</Link> : <>{it.product_name} <span className="small text-muted">(product deleted)</span></>}</span></td>
                      <td>{inr(it.price)}</td><td>{it.quantity}</td><td className="text-end">{inr(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan="3" className="text-end">Subtotal (MRP)</td><td className="text-end">{inr(o.subtotal)}</td></tr>
                  <tr><td colSpan="3" className="text-end">Discount</td><td className="text-end">− {inr(o.discount)}</td></tr>
                  <tr><td colSpan="3" className="text-end">Delivery charge (paid by customer)</td><td className="text-end">{inr(o.delivery_charge)}</td></tr>
                  <tr><td colSpan="3" className="text-end fw-bold">Total</td><td className="text-end fw-bold">{inr(o.total_amount)}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header d-flex flex-wrap gap-2 justify-content-between align-items-center">
              <strong><i className="bi bi-scooter" /> Delivery (Borzo)</strong>
              <div className="d-flex gap-2">
                {borzoConnected && canBook && <button className="btn btn-sm btn-gold" disabled={busy} onClick={() => run('/rider/book', 'POST', undefined, 'Book a Borzo rider now? The rider will come to the shop to pick up this parcel.')}><i className="bi bi-lightning-charge" /> Book Borzo rider</button>}
                {o.delivery_provider === 'borzo' && o.delivery_order_id && <button className="btn btn-sm btn-outline-dark" disabled={busy} onClick={() => run('/rider/refresh')}><i className="bi bi-arrow-repeat" /> Refresh</button>}
                {o.delivery_provider === 'borzo' && riderBooked && <button className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => run('/rider/cancel', 'POST', undefined, 'Cancel the Borzo rider?')}>Cancel rider</button>}
              </div>
            </div>
            <div className="card-body small">
              {o.delivery_status ? (
                <div className="row g-2">
                  <div className="col-sm-6">Partner: <strong>{o.delivery_provider}</strong>{o.delivery_order_id && <> · Booking #{o.delivery_order_id}</>}</div>
                  <div className="col-sm-6">Status: <span className={`badge text-bg-${DELIVERY_BADGE[o.delivery_status] || 'warning'}`}>{o.delivery_status.replace(/_/g, ' ')}</span></div>
                  {o.delivery_courier_name && <div className="col-sm-6">Rider: {o.delivery_courier_name} {o.delivery_courier_phone && <>· <a href={`tel:${o.delivery_courier_phone}`}>{o.delivery_courier_phone}</a></>}</div>}
                  {o.delivery_cost !== null && <div className="col-sm-6">Borzo charges you: <strong>{inr(o.delivery_cost)}</strong> (customer paid {inr(o.delivery_charge)})</div>}
                  {o.delivery_tracking_url && <div className="col-12"><a href={o.delivery_tracking_url} target="_blank" rel="noopener noreferrer"><i className="bi bi-geo-alt" /> Live tracking link</a></div>}
                </div>
              ) : !paid ? <span className="text-muted">A rider can be booked once the order is paid.</span>
                : !borzoConnected ? <span className="text-muted">Borzo is not connected yet. Book the rider in the Borzo app and save the tracking link below.</span>
                : <span className="text-muted">No rider booked yet.</span>}

              {paid && (
                <details className="mt-3">
                  <summary className="text-gold" style={{ cursor: 'pointer' }}>Booked the rider yourself in the Borzo / Rapido app? Add the details here</summary>
                  <form className="row g-2 mt-1" onSubmit={(e) => { e.preventDefault(); run('/rider/manual', 'PATCH', manual); }}>
                    <div className="col-sm-4"><select className="form-select form-select-sm" value={manual.delivery_provider} onChange={(e) => setManual({ ...manual, delivery_provider: e.target.value })}><option value="borzo">Borzo</option><option value="rapido">Rapido</option><option value="other">Other</option></select></div>
                    <div className="col-sm-8"><input className="form-control form-control-sm" placeholder="Tracking link (https://...)" value={manual.delivery_tracking_url} onChange={(e) => setManual({ ...manual, delivery_tracking_url: e.target.value })} /></div>
                    <div className="col-sm-6"><input className="form-control form-control-sm" placeholder="Rider name" value={manual.delivery_courier_name} onChange={(e) => setManual({ ...manual, delivery_courier_name: e.target.value })} /></div>
                    <div className="col-sm-6"><input className="form-control form-control-sm" placeholder="Rider phone" value={manual.delivery_courier_phone} onChange={(e) => setManual({ ...manual, delivery_courier_phone: e.target.value })} /></div>
                    <div className="col-12"><button className="btn btn-sm btn-dark" disabled={busy}>Save delivery details</button> <span className="text-muted">Then set the status to "Out for Delivery" so the customer gets the tracking link by email.</span></div>
                  </form>
                </details>
              )}
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>Payment details</strong>
              {payments.length > 0 && !paid && <button className="btn btn-sm btn-outline-dark" disabled={busy} onClick={() => run('/recheck')}><i className="bi bi-arrow-repeat" /> Re-check with Razorpay</button>}
            </div>
            <div className="table-responsive">
              <table className="table table-sm mb-0 small">
                <thead><tr><th>Razorpay order ID</th><th>Razorpay payment ID</th><th>Method</th><th>Amount</th><th>Status</th><th>Time</th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.transaction_id}</td><td>{p.gateway_payment_id || '—'}</td><td>{p.method || '—'}</td><td>{inr(p.amount)}</td>
                      <td><span className={`badge text-bg-${{ success: 'success', failed: 'danger' }[p.status] || 'warning'}`}>{p.status}</span></td>
                      <td>{dateTime(p.paid_at || p.created_at)}</td>
                    </tr>
                  ))}
                  {!payments.length && <tr><td colSpan="6" className="text-muted">The customer has not started a payment.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-xl-4">
          <div className="card mb-4">
            <div className="card-header"><strong>Status</strong></div>
            <div className="card-body">
              <p className="mb-2">Payment: <Badge info={paymentStatus(o.payment_status)} /></p>
              <p>Order: <Badge info={orderStatus(o.order_status)} /></p>
              <form onSubmit={(e) => { e.preventDefault(); run('/status', 'PATCH', { order_status: status }, status === 'cancelled' ? 'Cancel this order? Stock will be added back.' : null); }}>
                <label className="form-label small">Change order status</label>
                <div className="input-group">
                  <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                    {statuses.map((s) => <option key={s} value={s}>{ORDER_STATUS[s].label}</option>)}
                  </select>
                  <button className="btn btn-dark" disabled={busy || status === o.order_status}>Update</button>
                </div>
                <div className="form-text">The customer gets an email for Preparing, Out for Delivery, Delivered and Cancelled.</div>
              </form>
              {paid && (
                <>
                  <hr />
                  <button className="btn btn-sm btn-outline-danger w-100" disabled={busy} onClick={() => run('/refunded', 'POST', undefined, 'Only do this after refunding the money in your Razorpay dashboard. Continue?')}>Mark as Refunded</button>
                  <div className="form-text">Payment status is set automatically from verified Razorpay results. Use this only after you refund from the Razorpay dashboard.</div>
                </>
              )}
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header"><strong>Customer</strong></div>
            <div className="card-body small">
              <p className="mb-1"><strong>{user?.name}</strong></p>
              <p className="mb-1"><i className="bi bi-envelope" /> <a href={`mailto:${user?.email}`}>{user?.email}</a></p>
              {user?.mobile && <p className="mb-0"><i className="bi bi-phone" /> <a href={`tel:${user.mobile}`}>{user.mobile}</a></p>}
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header"><strong>Delivery address</strong></div>
            <div className="card-body small">
              <strong>{o.shipping_name}</strong><br /><a href={`tel:${o.shipping_mobile}`}>{o.shipping_mobile}</a><br />{address}
              <div className="mt-2"><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-dark"><i className="bi bi-map" /> Open in Maps</a></div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><strong>Notes</strong> <span className="small text-muted">(only you can see these)</span></div>
            <div className="card-body">
              <textarea rows="5" className="form-control form-control-sm" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn btn-sm btn-outline-dark mt-2" disabled={busy} onClick={() => run('/note', 'PATCH', { admin_note: note })}>Save note</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
