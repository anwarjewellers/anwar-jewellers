import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { MAX_PER_ITEM } from '../../shared/constants.js';
import { api, payWithRazorpay } from '../api.js';
import { AddressFields, EMPTY_ADDRESS, addressLine } from '../components/AddressFields.jsx';
import { Empty, Loading } from '../components/Ui.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { imageUrl, inr, setTitle } from '../format.js';

/** Prices the browser cart on the server whenever it changes. */
function useQuote() {
  const { cartItems, setCartQuantity } = useShop();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const key = JSON.stringify(cartItems);

  useEffect(() => {
    let alive = true;
    if (!cartItems.length) { setQuote({ lines: [], totals: { subtotal: 0, discount: 0, total: 0, count: 0 }, deliveryEstimate: 0 }); return; }
    api('/cart/quote', { method: 'POST', body: { items: cartItems } })
      .then((q) => {
        if (!alive) return;
        // Forget products that were deleted from the shop.
        const known = new Set(q.lines.map((l) => l.product.id));
        cartItems.filter((i) => !known.has(i.productId)).forEach((i) => setCartQuantity(i.productId, 0));
        setQuote(q); setError(null);
      })
      .catch((e) => alive && setError(e));
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { quote, error };
}

function Summary({ quote, children }) {
  const { totals, deliveryEstimate } = quote;
  return (
    <>
      <dl className="row mb-0 small">
        <dt className="col-7 fw-normal">Subtotal (MRP)</dt><dd className="col-5 text-end">{inr(totals.subtotal)}</dd>
        <dt className="col-7 fw-normal">Discount</dt><dd className="col-5 text-end text-success">− {inr(totals.discount)}</dd>
        <dt className="col-7 fw-normal">Delivery (Borzo)</dt>
        <dd className="col-5 text-end">{deliveryEstimate === null ? <span className="text-muted">by distance</span> : deliveryEstimate === 0 ? <span className="text-success">FREE</span> : inr(deliveryEstimate)}</dd>
      </dl>
      <div className="d-flex justify-content-between fs-5 fw-bold mt-2">
        <span>Total</span>
        <span>{inr(totals.total + (deliveryEstimate || 0))}{deliveryEstimate === null && <small className="fs-6 fw-normal text-muted"> + delivery</small>}</span>
      </div>
      {deliveryEstimate === null && <p className="small text-muted mt-1 mb-0">The delivery charge depends on the distance to your address. You will see it before paying.</p>}
      {children}
    </>
  );
}

export function Cart() {
  const { settings, setCartQuantity, user } = useShop();
  const { quote, error } = useQuote();
  const navigate = useNavigate();
  useEffect(() => { setTitle('Your Cart', settings.shop_name); }, [settings.shop_name]);

  if (error) return <div className="container py-5 text-center text-danger">{error.message}</div>;
  if (!quote) return <Loading />;
  if (!quote.lines.length) {
    return (
      <div className="container py-4">
        <Empty icon="bi-bag" title="Your cart is empty"><p>Browse our collection and add something you love.</p><Link to="/products" className="btn btn-gold">Shop Now</Link></Empty>
      </div>
    );
  }
  const hasProblem = quote.lines.some((l) => l.problem);

  return (
    <div className="container py-4">
      <h1 className="page-title">Your Cart <span className="fs-6 text-muted">({quote.totals.count} item{quote.totals.count === 1 ? '' : 's'})</span></h1>
      <div className="row g-4">
        <div className="col-lg-8">
          {quote.lines.map((l) => {
            const max = Math.max(1, Math.min(l.product.stock_quantity, MAX_PER_ITEM));
            return (
              <div className="cart-line" key={l.product.id}>
                <Link to={`/products/${l.product.slug}`} className="cart-img"><img src={imageUrl(l.product.thumb_key)} alt={l.product.name} /></Link>
                <div className="flex-grow-1">
                  <Link to={`/products/${l.product.slug}`} className="text-dark fw-semibold">{l.product.name}</Link>
                  <div className="price-row mt-1">
                    <span className="price">{inr(l.price)}</span>
                    {l.mrp > l.price && <span className="mrp">{inr(l.mrp)}</span>}
                  </div>
                  {l.problem && <div className="small text-danger mt-1"><i className="bi bi-exclamation-triangle" /> {l.problem}</div>}
                  <div className="d-flex align-items-center gap-3 mt-2">
                    <div className="qty-selector">
                      <button type="button" onClick={() => setCartQuantity(l.product.id, l.quantity - 1)} aria-label="Decrease">−</button>
                      <input type="number" value={l.quantity} readOnly aria-label="Quantity" />
                      <button type="button" disabled={l.quantity >= max} onClick={() => setCartQuantity(l.product.id, l.quantity + 1)} aria-label="Increase">+</button>
                    </div>
                    <button className="btn btn-link text-danger p-0 small" onClick={() => setCartQuantity(l.product.id, 0)}><i className="bi bi-trash" /> Remove</button>
                    {l.problem && l.product.stock_quantity > 0 && l.quantity > l.product.stock_quantity && (
                      <button className="btn btn-link p-0 small" onClick={() => setCartQuantity(l.product.id, l.product.stock_quantity)}>Set to {l.product.stock_quantity}</button>
                    )}
                  </div>
                </div>
                <div className="fw-semibold text-nowrap">{inr(l.line_total)}</div>
              </div>
            );
          })}
          <Link to="/products" className="small"><i className="bi bi-arrow-left" /> Continue shopping</Link>
        </div>
        <div className="col-lg-4">
          <div className="summary-box">
            <h2 className="h5 mb-3">Order Summary</h2>
            <Summary quote={quote}>
              {hasProblem && <div className="alert alert-warning small mt-3 mb-0">Please fix the items marked in red before checkout.</div>}
              <button className="btn btn-gold btn-lg w-100 mt-3" disabled={hasProblem} onClick={() => navigate(user ? '/checkout' : '/login', { state: { from: '/checkout' } })}>
                {user ? 'Proceed to Checkout' : 'Login to Checkout'}
              </button>
              <p className="small text-muted mt-2 mb-0"><i className="bi bi-shield-lock" /> Secure payment: UPI, cards, net banking</p>
            </Summary>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Checkout() {
  const { settings, cartItems, notify, clearCart } = useShop();
  const navigate = useNavigate();
  const { quote, error } = useQuote();
  const [addresses, setAddresses] = useState(null);
  const [choice, setChoice] = useState('new');
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setTitle('Checkout', settings.shop_name); }, [settings.shop_name]);
  useEffect(() => {
    api('/addresses').then(({ addresses: list }) => {
      setAddresses(list);
      if (list.length) setChoice(String(list[0].id));
    }).catch(() => setAddresses([]));
  }, []);

  if (!cartItems.length) return <Navigate to="/cart" replace />;
  if (error) return <div className="container py-5 text-center text-danger">{error.message}</div>;
  if (!quote || !addresses) return <Loading />;
  if (quote.lines.some((l) => l.problem)) return <Navigate to="/cart" replace />;

  const est = quote.deliveryEstimate;
  const placeOrder = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setFormError('');
    try {
      const res = await api('/checkout', { method: 'POST', body: { items: cartItems, addressId: choice, address: choice === 'new' ? address : undefined } });
      const outcome = await payWithRazorpay(res.orderId, res.payment);
      if (outcome === 'success') clearCart();
      navigate(`/orders/${res.orderId}?payment=${outcome}`, { replace: true });
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message);
      notify(err.message, 'danger');
      setBusy(false);
    }
  };

  return (
    <div className="container py-4">
      <h1 className="page-title">Checkout</h1>
      <form onSubmit={placeOrder}>
        <div className="row g-4">
          <div className="col-lg-7">
            <div className="card-box">
              <h2 className="h5 mb-2"><span className="step">1</span> Delivery Address</h2>
              <p className="small text-muted mb-3"><i className="bi bi-lightning-charge text-gold" /> Instant delivery by our partner <strong>Borzo</strong>: a rider picks up your parcel from our shop and brings it to you. We currently deliver only within <strong>{settings.delivery_area_name || 'Hyderabad'}</strong>.</p>
              {addresses.length > 0 && (
                <div className="address-list">
                  {addresses.map((a) => (
                    <label className="address-option" key={a.id}>
                      <input type="radio" name="address" className="form-check-input" checked={choice === String(a.id)} onChange={() => setChoice(String(a.id))} />
                      <span>
                        <strong>{a.full_name}</strong> · {a.mobile} {a.is_default ? <span className="badge text-bg-light">Default</span> : null}<br />
                        <span className="small text-muted">{addressLine(a)}</span>
                      </span>
                    </label>
                  ))}
                  <label className="address-option">
                    <input type="radio" name="address" className="form-check-input" checked={choice === 'new'} onChange={() => setChoice('new')} />
                    <span><i className="bi bi-plus-circle" /> Deliver to a new address</span>
                  </label>
                </div>
              )}
              {choice === 'new' && <div className="mt-3"><AddressFields value={address} onChange={setAddress} errors={errors} /></div>}
              {errors.pincode && choice !== 'new' && <div className="text-danger small mt-2">{formError}</div>}
            </div>
          </div>

          <div className="col-lg-5">
            <div className="summary-box">
              <h2 className="h5 mb-3"><span className="step">2</span> Order Summary</h2>
              {quote.lines.map((l) => (
                <div className="d-flex gap-2 mb-2 align-items-center" key={l.product.id}>
                  <img src={imageUrl(l.product.thumb_key)} alt="" className="summary-thumb" />
                  <div className="flex-grow-1 small">{l.product.name}<br /><span className="text-muted">{l.quantity} × {inr(l.price)}</span></div>
                  <div className="small fw-semibold">{inr(l.line_total)}</div>
                </div>
              ))}
              <hr />
              <Summary quote={quote} />
              <h2 className="h5 mt-4 mb-2"><span className="step">3</span> Payment</h2>
              <p className="small text-muted mb-3"><i className="bi bi-shield-lock" /> You will pay securely through Razorpay using UPI, debit/credit card, net banking or wallets.</p>
              {formError && <div className="alert alert-danger small">{formError}</div>}
              <button className="btn btn-gold btn-lg w-100" disabled={busy}>
                {busy ? <><span className="spinner-border spinner-border-sm" /> Please wait…</> : est === null ? 'Continue to Payment' : `Pay Now ${inr(quote.totals.total + est)}`}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
