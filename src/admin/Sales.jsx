import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Loading } from '../components/Ui.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { imageUrl, inr } from '../format.js';
import { useApi } from '../hooks.js';
import { useAdminTitle } from './AdminLayout.jsx';
import { BarChart, Stat } from './Dashboard.jsx';
import { resizedForUpload } from './Products.jsx';

export function Sales() {
  useAdminTitle('Sales');
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useApi(`/admin/sales?${params}`);
  const period = params.get('period') || 'month';
  const [from, setFrom] = useState(params.get('from') || '');
  const [to, setTo] = useState(params.get('to') || '');

  return (
    <>
      <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
        {[['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year']].map(([k, label]) => (
          <button key={k} className={`btn btn-sm ${period === k ? 'btn-gold' : 'btn-outline-dark'}`} onClick={() => setParams({ period: k })}>{label}</button>
        ))}
        <form className="d-flex gap-2 align-items-end" onSubmit={(e) => { e.preventDefault(); if (from && to) setParams({ period: 'custom', from, to }); }}>
          <div><label className="form-label small mb-0">From</label><input type="date" className="form-control form-control-sm" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="form-label small mb-0">To</label><input type="date" className="form-control form-control-sm" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <button className={`btn btn-sm ${period === 'custom' ? 'btn-gold' : 'btn-dark'}`}>Show</button>
        </form>
        <a className="btn btn-sm btn-outline-dark ms-auto" href={`/api/admin/sales/export?${params}`}><i className="bi bi-download" /> Export CSV (Excel)</a>
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (
        <>
          <h2 className="h6 text-muted mb-3">{data.label}</h2>
          <div className="row g-3 mb-4">
            <div className="col-6 col-xl"><Stat icon="bi-currency-rupee" label="Total sales" value={inr(data.summary.total_sales)} tone="gold" /></div>
            <div className="col-6 col-xl"><Stat icon="bi-receipt" label="Orders" value={data.summary.total_orders} /></div>
            <div className="col-6 col-xl"><Stat icon="bi-check2-circle" label="Paid" value={data.summary.paid_orders} tone="ok" /></div>
            <div className="col-6 col-xl"><Stat icon="bi-x-circle" label="Cancelled" value={data.summary.cancelled_orders} tone={data.summary.cancelled_orders ? 'bad' : ''} /></div>
            <div className="col-6 col-xl"><Stat icon="bi-hourglass" label="Not paid" value={data.summary.unpaid_orders} /></div>
          </div>
          <div className="card mb-4"><div className="card-header"><strong>Sales</strong></div><div className="card-body"><BarChart data={data.chart} /></div></div>
          <div className="row g-4">
            <div className="col-xl-7">
              <div className="card">
                <div className="card-header"><strong>Top products</strong></div>
                <div className="table-responsive">
                  <table className="table mb-0"><thead><tr><th>Product</th><th>Qty sold</th><th className="text-end">Revenue</th></tr></thead>
                    <tbody>
                      {data.top.map((t) => <tr key={`${t.product_id}-${t.product_name}`}><td>{t.product_name}</td><td>{t.qty}</td><td className="text-end">{inr(t.revenue)}</td></tr>)}
                      {!data.top.length && <tr><td colSpan="3" className="text-muted">No sales in this period.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="col-xl-5">
              <div className="card">
                <div className="card-header"><strong>Monthly sales (last 12 months)</strong></div>
                <div className="table-responsive">
                  <table className="table table-sm mb-0"><thead><tr><th>Month</th><th>Orders</th><th className="text-end">Amount</th></tr></thead>
                    <tbody>{data.monthly.map((m) => <tr key={m.month}><td>{m.month}</td><td>{m.orders}</td><td className="text-end">{inr(m.amount)}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

const PAGE_FIELDS = [['about_us', 'About Us'], ['privacy_policy', 'Privacy Policy'], ['terms_conditions', 'Terms & Conditions'], ['return_policy', 'Return Policy'], ['shipping_info', 'Shipping / Delivery Information']];

export function Settings() {
  useAdminTitle('Settings');
  const { notify, refresh } = useShop();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [s, setS] = useState({});
  const [busy, setBusy] = useState(false);

  const load = () => api('/admin/settings').then((d) => { setData(d); setS(d.settings); }).catch(setError);
  useEffect(() => { load(); }, []);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const c = data.connections;
  const bind = (k) => ({ name: k, value: s[k] ?? '', onChange: (e) => setS({ ...s, [k]: e.target.value }), className: 'form-control' });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.target);
    for (const [field, width] of [['logo', 400], ['hero_image', 1920]]) {
      const file = fd.get(field);
      if (file && file.size) fd.set(field, await resizedForUpload(file, width)); else fd.delete(field);
    }
    fd.set('delivery_auto_book', s.delivery_auto_book === '1' ? '1' : '0');
    try { notify((await api('/admin/settings', { method: 'PUT', form: fd })).message); await load(); refresh(); e.target.reset(); } catch (err) { notify(err.message, 'danger'); }
    setBusy(false);
  };

  const Conn = ({ ok, label, extra }) => <li className="d-flex justify-content-between"><span>{label}</span><span className={ok ? 'text-success' : 'text-warning'}>{ok ? `Connected${extra ? ` (${extra})` : ''}` : 'Not connected'}</span></li>;

  return (
    <form onSubmit={submit}>
      <div className="row g-4">
        <div className="col-xl-6">
          <div className="card mb-4">
            <div className="card-header"><strong>Connections</strong> <span className="small text-muted">(keys are set in Cloudflare, see docs/DEPLOYMENT.md)</span></div>
            <div className="card-body small">
              <ul className="list-unstyled mb-0 d-grid gap-1">
                <Conn ok={c.razorpay} label="Razorpay payments" extra={c.razorpayMode} />
                <Conn ok={c.razorpayWebhook} label="Razorpay webhook" />
                <Conn ok={c.borzo} label="Borzo delivery" extra={c.borzoMode} />
                <Conn ok={c.email} label="Emails (Resend)" />
                <Conn ok={c.images} label="Photo storage (R2)" />
              </ul>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header"><strong>Shop details</strong></div>
            <div className="card-body">
              <div className="mb-3"><label className="form-label">Shop name *</label><input {...bind('shop_name')} required /></div>
              <div className="mb-3"><label className="form-label">Tagline</label><input {...bind('tagline')} /></div>
              <div className="mb-3">
                <label className="form-label">Logo</label>
                {s.logo_key && <div className="d-flex align-items-center gap-3 mb-2"><img src={imageUrl(s.logo_key)} alt="" style={{ maxHeight: 50 }} /><div className="form-check"><input type="checkbox" className="form-check-input" name="remove_logo" value="1" id="rmLogo" /><label htmlFor="rmLogo" className="form-check-label small">Remove</label></div></div>}
                <input type="file" name="logo" className="form-control" accept="image/jpeg,image/png,image/webp" />
              </div>
              <div className="row g-3">
                <div className="col-md-6"><label className="form-label">Contact number</label><input {...bind('contact_phone')} /></div>
                <div className="col-md-6"><label className="form-label">WhatsApp number</label><input {...bind('whatsapp_number')} placeholder="919876543210" /></div>
                <div className="col-12"><label className="form-label">Main email <span className="small text-muted">(shown on the website; new-order emails are sent here)</span></label><input type="email" {...bind('contact_email')} /></div>
                <div className="col-md-6"><label className="form-label">Support email <span className="small text-muted">(returns, delivery help)</span></label><input type="email" {...bind('support_email')} /></div>
                <div className="col-md-6"><label className="form-label">Sales email <span className="small text-muted">(retail enquiries)</span></label><input type="email" {...bind('sales_email')} /></div>
                <div className="col-12"><label className="form-label">Shop address <span className="small text-muted">(shown on Our Store page; Borzo riders pick up from here)</span></label><textarea rows="2" {...bind('shop_address')} /></div>
                <div className="col-md-6"><label className="form-label">Store timings</label><input {...bind('store_hours')} placeholder="Mon–Sun · 11 AM – 9 PM" /></div>
                <div className="col-md-6"><label className="form-label">Exact map pin <span className="small text-muted">(optional)</span></label><input {...bind('store_map_query')} placeholder="17.3539,78.4925" /><div className="form-text">Leave empty to use the address. For an exact pin: Google Maps → long-press the shop → copy the numbers.</div></div>
              </div>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header"><strong>Social media links</strong></div>
            <div className="card-body">
              <div className="mb-3"><label className="form-label">Instagram</label><input {...bind('instagram_url')} placeholder="https://instagram.com/yourshop" /></div>
              <div className="mb-3"><label className="form-label">Facebook</label><input {...bind('facebook_url')} /></div>
              <div><label className="form-label">YouTube</label><input {...bind('youtube_url')} /></div>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header"><strong>Homepage banner</strong></div>
            <div className="card-body">
              <div className="mb-3"><label className="form-label">Heading</label><input {...bind('hero_title')} /></div>
              <div className="mb-3"><label className="form-label">Sub-heading</label><input {...bind('hero_subtitle')} /></div>
              <label className="form-label">Banner image <span className="small text-muted">(wide photo, e.g. 1920×700)</span></label>
              {s.hero_image_key && <div className="d-flex align-items-center gap-3 mb-2"><img src={imageUrl(s.hero_image_key)} alt="" style={{ maxHeight: 60 }} /><div className="form-check"><input type="checkbox" className="form-check-input" name="remove_hero_image" value="1" id="rmHero" /><label htmlFor="rmHero" className="form-check-label small">Remove</label></div></div>}
              <input type="file" name="hero_image" className="form-control" accept="image/jpeg,image/png,image/webp" />
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header"><strong><i className="bi bi-scooter" /> Delivery (Borzo)</strong></div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label">How to charge customers for delivery</label>
                <select {...bind('delivery_pricing')} className="form-select">
                  <option value="flat">Fixed charge for all of {s.delivery_area_name}</option>
                  <option value="live">Borzo's real price for each address (needs Borzo connected)</option>
                </select>
              </div>
              <div className="row g-3">
                <div className="col-md-6"><label className="form-label">Fixed delivery charge (₹)</label><input type="number" min="0" {...bind('delivery_flat_charge')} /><div className="form-text">Also used if Borzo's price can't be fetched.</div></div>
                <div className="col-md-6"><label className="form-label">Free delivery above (₹)</label><input type="number" min="0" {...bind('free_delivery_above')} /><div className="form-text">0 = never free.</div></div>
                <div className="col-md-6"><label className="form-label">Delivery area name</label><input {...bind('delivery_area_name')} /></div>
                <div className="col-md-6"><label className="form-label">Allowed pincodes (starting with)</label><input {...bind('delivery_pincodes')} /><div className="form-text">500 = all Hyderabad 500xxx pincodes. Add more with commas, e.g. 500, 501301, 502032.</div></div>
                <div className="col-md-6"><label className="form-label">Pickup contact name</label><input {...bind('pickup_contact_name')} /></div>
                <div className="col-md-6"><label className="form-label">Pickup phone (rider calls this)</label><input {...bind('pickup_phone')} /></div>
              </div>
              <div className="form-text mb-2">The rider picks up from the <strong>Shop address</strong> above, so keep it complete (shop no., street, area, pincode).</div>
              <div className="form-check form-switch mt-2">
                <input className="form-check-input" type="checkbox" role="switch" id="autoBook" checked={s.delivery_auto_book === '1'} onChange={(e) => setS({ ...s, delivery_auto_book: e.target.checked ? '1' : '0' })} />
                <label className="form-check-label" htmlFor="autoBook">Book a Borzo rider automatically as soon as an order is paid</label>
              </div>
              {!c.borzo && <div className="alert alert-warning small mt-3 mb-0">Borzo is not connected yet: add <code>BORZO_API_TOKEN</code> in Cloudflare. Until then, customers pay the fixed charge and you book riders in the Borzo app.</div>}
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header"><strong>Inventory</strong></div>
            <div className="card-body"><label className="form-label">Low-stock warning at (quantity)</label><input type="number" min="0" {...bind('low_stock_threshold')} style={{ maxWidth: 140 }} /></div>
          </div>
        </div>

        <div className="col-xl-6">
          <div className="card mb-4">
            <div className="card-header"><strong>Website pages</strong> <span className="small text-muted">(plain text; new lines are kept)</span></div>
            <div className="card-body">
              {PAGE_FIELDS.map(([k, label]) => <div className="mb-3" key={k}><label className="form-label">{label}</label><textarea rows="5" {...bind(k)} /></div>)}
            </div>
          </div>
        </div>
      </div>
      <div className="admin-savebar"><button className="btn btn-gold px-4" disabled={busy}>{busy ? 'Saving…' : 'Save Settings'}</button></div>
    </form>
  );
}
