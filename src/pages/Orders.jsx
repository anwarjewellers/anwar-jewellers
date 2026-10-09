import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, payWithRazorpay } from '../api.js';
import { Badge, Empty, ErrorBox, Loading } from '../components/Ui.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { dateOnly, dateTime, imageUrl, inr, orderStatus, paymentStatus, setTitle } from '../format.js';
import { useApi } from '../hooks.js';

const PAYMENT_MESSAGES = {
  success: ['success', 'Payment successful! Thank you for your order.'],
  failed: ['danger', 'The payment did not go through. No money was taken, or it will be refunded automatically by your bank. You can try again below.'],
  pending: ['warning', 'We are waiting for the bank to confirm your payment. This page will show the update once it is confirmed.'],
  cancelled: ['info', 'Payment was not completed. Your order is saved – you can pay for it below whenever you are ready.'],
  error: ['warning', 'We could not confirm your payment yet. If money was taken from your account, please contact us with your order number.'],
};

export function Orders() {
  const { settings } = useShop();
  const [params] = useSearchParams();
  const { data, error, loading, reload } = useApi('/orders');
  useEffect(() => { setTitle('My Orders', settings.shop_name); }, [settings.shop_name]);
  const msg = PAYMENT_MESSAGES[params.get('payment')];

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      <h1 className="page-title">My Orders</h1>
      {msg && <div className={`alert alert-${msg[0]}`}>{msg[1]}</div>}
      {loading && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && !data.orders.length && <Empty icon="bi-receipt" title="No orders yet"><Link className="btn btn-gold" to="/products">Start shopping</Link></Empty>}
      {data?.orders.map((o) => (
        <Link className="order-row" to={`/orders/${o.id}`} key={o.id}>
          <div><strong>{o.order_number}</strong><div className="small text-muted">{dateOnly(o.created_at)}</div></div>
          <div>{inr(o.total_amount)}<div className="small text-muted">{o.item_count} item{o.item_count === 1 ? '' : 's'}</div></div>
          <div><Badge info={orderStatus(o.order_status)} /></div>
          <i className="bi bi-chevron-right" />
        </Link>
      ))}
    </div>
  );
}

const TRACK = ['order_confirmed', 'preparing', 'out_for_delivery', 'delivered'];

export function OrderDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { settings, clearCart, notify } = useShop();
  const { data, error, loading, reload } = useApi(`/orders/${id}`);
  const [paying, setPaying] = useState(false);
  const outcome = params.get('payment');
  const navigate = useNavigate();

  useEffect(() => { setTitle(data ? `Order ${data.order.order_number}` : 'Order', settings.shop_name); }, [data, settings.shop_name]);
  // The order is paid: the cart was bought, so empty it.
  useEffect(() => { if (data?.order.payment_status === 'paid' && outcome) clearCart(); }, [data, outcome, clearCart]);
  // Waiting for the bank: check again every 10 seconds for 2 minutes.
  useEffect(() => {
    if (!data || data.order.payment_status === 'paid' || !['pending', 'error'].includes(outcome)) return;
    let n = 0;
    const t = setInterval(() => { if (++n > 12) clearInterval(t); else api(`/orders/${id}/payment/sync`, { method: 'POST' }).catch(() => {}).finally(reload); }, 10000);
    return () => clearInterval(t);
  }, [data, outcome, reload]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const { order: o, items } = data;
  const msg = PAYMENT_MESSAGES[o.payment_status === 'paid' && outcome ? 'success' : outcome];
  const step = o.order_status === 'payment_confirmed' ? 0 : TRACK.indexOf(o.order_status);

  const payAgain = async () => {
    setPaying(true);
    try {
      const { payment } = await api(`/orders/${o.id}/pay`, { method: 'POST' });
      const result = await payWithRazorpay(o.id, payment);
      setPaying(false);
      navigate(`/orders/${o.id}?payment=${result}`, { replace: true });
      reload();
    } catch (e) { notify(e.message, 'danger'); setPaying(false); }
  };

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      <Link to="/orders" className="small"><i className="bi bi-arrow-left" /> My orders</Link>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-2 mb-3">
        <h1 className="page-title mb-0">Order {o.order_number}</h1>
        <div className="d-flex gap-2"><Badge info={paymentStatus(o.payment_status)} /><Badge info={orderStatus(o.order_status)} /></div>
      </div>
      <p className="small text-muted">Placed on {dateTime(o.created_at)}</p>
      {msg && <div className={`alert alert-${msg[0]}`}>{msg[1]}</div>}

      {o.can_be_paid && (
        <div className="card-box mb-4 d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span>This order is waiting for payment of <strong>{inr(o.total_amount)}</strong>.</span>
          <button className="btn btn-gold" onClick={payAgain} disabled={paying}>{paying ? 'Please wait…' : 'Pay Now'}</button>
        </div>
      )}

      {o.order_status !== 'cancelled' && o.payment_status === 'paid' && (
        <ul className="order-track">
          {['Confirmed', 'Preparing', 'Out for Delivery', 'Delivered'].map((label, i) => (
            <li key={label} className={i <= step ? 'done' : ''}><span />{label}</li>
          ))}
        </ul>
      )}

      {o.delivery_tracking_url && ['out_for_delivery', 'order_confirmed', 'preparing'].includes(o.order_status) && (
        <div className="card-box mb-4">
          <i className="bi bi-scooter text-gold" /> Your delivery partner: <strong>{o.delivery_provider === 'borzo' ? 'Borzo' : o.delivery_provider}</strong>
          {o.delivery_courier_name && <> · Rider: {o.delivery_courier_name}{o.delivery_courier_phone && <> (<a href={`tel:${o.delivery_courier_phone}`}>{o.delivery_courier_phone}</a>)</>}</>}
          <div className="mt-2"><a className="btn btn-outline-gold btn-sm" href={o.delivery_tracking_url} target="_blank" rel="noopener noreferrer"><i className="bi bi-geo-alt" /> Track live</a></div>
        </div>
      )}

      <div className="row g-4">
        <div className="col-md-7">
          <div className="card-box">
            <h2 className="h6 text-uppercase text-gold">Items</h2>
            {items.map((it) => (
              <div className="d-flex gap-2 mb-2 align-items-center" key={it.id}>
                <img src={imageUrl(it.thumb_key)} alt="" className="summary-thumb" />
                <div className="flex-grow-1 small">
                  {it.slug ? <Link to={`/products/${it.slug}`}>{it.product_name}</Link> : it.product_name}<br />
                  <span className="text-muted">{it.quantity} × {inr(it.price)}</span>
                </div>
                <div className="small fw-semibold">{inr(it.total)}</div>
              </div>
            ))}
            <hr />
            <dl className="row mb-0 small">
              <dt className="col-7 fw-normal">Subtotal (MRP)</dt><dd className="col-5 text-end">{inr(o.subtotal)}</dd>
              <dt className="col-7 fw-normal">Discount</dt><dd className="col-5 text-end text-success">− {inr(o.discount)}</dd>
              <dt className="col-7 fw-normal">Delivery</dt><dd className="col-5 text-end">{Number(o.delivery_charge) ? inr(o.delivery_charge) : 'FREE'}</dd>
              <dt className="col-7">Total</dt><dd className="col-5 text-end fw-bold">{inr(o.total_amount)}</dd>
            </dl>
          </div>
        </div>
        <div className="col-md-5">
          <div className="card-box">
            <h2 className="h6 text-uppercase text-gold">Delivery address</h2>
            <p className="small mb-0"><strong>{o.shipping_name}</strong> · {o.shipping_mobile}<br />{o.shipping_address}</p>
          </div>
          <p className="small text-muted mt-3">Need help with this order? Call <a href={`tel:${(settings.contact_phone || '').replace(/\s/g, '')}`}>{settings.contact_phone}</a>{settings.whatsapp_number && <> or <a href={`https://wa.me/${settings.whatsapp_number}?text=${encodeURIComponent(`Hi, about my order ${o.order_number}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp us</a></>}.</p>
        </div>
      </div>
    </div>
  );
}
