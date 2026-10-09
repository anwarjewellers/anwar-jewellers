import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, FieldError, Loading, Pagination } from '../components/Ui.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { imageUrl, inr } from '../format.js';
import { useApi } from '../hooks.js';
import { useAdminTitle } from './AdminLayout.jsx';

/** Shrinks a photo in the browser before upload (saves storage and makes pages fast). */
async function resize(file, maxWidth, quality = 0.85) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', quality));
  if (!blob) throw new Error('Could not process this photo. Please try a JPG or PNG.');
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' });
}

async function uploadPhoto(productId, file) {
  const form = new FormData();
  form.append('image', await resize(file, 1200));
  form.append('thumb', await resize(file, 400, 0.8));
  return api(`/admin/products/${productId}/images`, { method: 'POST', form });
}

/** Single image field resized before upload (categories, logo, banner). */
export async function resizedForUpload(file, width = 1200) {
  return file ? resize(file, width) : null;
}

export function ProductList() {
  useAdminTitle('Products');
  const { notify } = useShop();
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useApi(`/admin/products?${params}`);
  const { data: cats } = useApi('/admin/categories');
  const [q, setQ] = useState(params.get('q') || '');

  const set = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); n.delete('page'); setParams(n); };
  const act = async (path, method, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    try { notify((await api(path, { method })).message); reload(); } catch (e) { notify(e.message, 'danger'); }
  };

  return (
    <>
      <div className="d-flex flex-wrap gap-2 mb-3">
        <form className="d-flex gap-2" onSubmit={(e) => { e.preventDefault(); set('q', q); }}>
          <input className="form-control" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-dark">Search</button>
        </form>
        <select className="form-select" style={{ maxWidth: 200 }} value={params.get('category') || ''} onChange={(e) => set('category', e.target.value)}>
          <option value="">All categories</option>
          {cats?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 150 }} value={params.get('status') || ''} onChange={(e) => set('status', e.target.value)}>
          <option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
        <Link to="/admin/products/new" className="btn btn-gold ms-auto"><i className="bi bi-plus-lg" /> Add Product</Link>
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (
        <div className="card">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th className="text-end">Actions</th></tr></thead>
              <tbody>
                {data.products.map((p) => (
                  <tr key={p.id}>
                    <td className="d-flex align-items-center gap-2"><img src={imageUrl(p.thumb_key)} className="admin-thumb" alt="" /><Link to={`/admin/products/${p.id}`}>{p.name}</Link></td>
                    <td className="small">{p.category_name}</td>
                    <td>{inr(p.price)}{p.original_price && <div className="small text-muted text-decoration-line-through">{inr(p.original_price)}</div>}</td>
                    <td className={p.stock_quantity === 0 ? 'text-danger' : ''}>{p.stock_quantity}</td>
                    <td><button className={`btn btn-sm badge text-bg-${p.status === 'active' ? 'success' : 'secondary'}`} title="Click to change" onClick={() => act(`/admin/products/${p.id}/status`, 'PATCH')}>{p.status}</button></td>
                    <td className="text-end text-nowrap">
                      {p.status === 'active' && <a className="btn btn-sm btn-outline-dark me-1" href={`/products/${p.slug}`} target="_blank" rel="noreferrer" title="View on website"><i className="bi bi-eye" /></a>}
                      <Link className="btn btn-sm btn-outline-dark me-1" to={`/admin/products/${p.id}`} title="Edit"><i className="bi bi-pencil" /></Link>
                      <button className="btn btn-sm btn-outline-danger" title="Delete" onClick={() => act(`/admin/products/${p.id}`, 'DELETE', `Delete "${p.name}"?`)}><i className="bi bi-trash" /></button>
                    </td>
                  </tr>
                ))}
                {!data.products.length && <tr><td colSpan="6" className="text-muted">No products yet. Click "Add Product" to add your first one.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {data && <Pagination page={data.page} lastPage={data.lastPage} makeHref={(p) => { const n = new URLSearchParams(params); n.set('page', p); return `?${n}`; }} />}
    </>
  );
}

const EMPTY = { name: '', category_id: '', price: '', original_price: '', stock_quantity: '1', material: '', colour: '', size: '', weight: '', description: '', meta_description: '', status: 'active' };

/** Remounts the form when moving from "new" to the saved product. */
export function ProductForm() {
  const { id } = useParams();
  return <ProductFormInner key={id || 'new'} id={id} />;
}

function ProductFormInner({ id }) {
  useAdminTitle(id ? 'Edit product' : 'Add product');
  const navigate = useNavigate();
  const { notify } = useShop();
  const { data: cats } = useApi('/admin/categories');
  const [values, setValues] = useState(id ? null : EMPTY);
  const [images, setImages] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [newPhotos, setNewPhotos] = useState([]);
  const [uploading, setUploading] = useState('');

  const load = async () => {
    const { product } = await api(`/admin/products/${id}`);
    const v = {};
    for (const k of Object.keys(EMPTY)) v[k] = product[k] === null || product[k] === undefined ? '' : String(product[k]);
    setValues(v);
    setImages(product.images);
  };
  useEffect(() => { if (id) load().catch((e) => notify(e.message, 'danger')); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!values) return <Loading />;
  const bind = (name) => ({
    value: values[name], onChange: (e) => setValues({ ...values, [name]: e.target.value }),
    className: `form-control${errors[name] ? ' is-invalid' : ''}`, id: `f-${name}`,
  });

  const uploadAll = async (productId, files) => {
    let done = 0;
    for (const file of files) {
      setUploading(`Uploading photo ${done + 1} of ${files.length}…`);
      try { await uploadPhoto(productId, file); done++; } catch (e) { notify(`${file.name}: ${e.message}`, 'danger'); }
    }
    setUploading('');
    return done;
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({});
    try {
      const res = await api(id ? `/admin/products/${id}` : '/admin/products', { method: id ? 'PUT' : 'POST', body: values });
      const productId = id || res.id;
      if (newPhotos.length) await uploadAll(productId, newPhotos);
      setNewPhotos([]);
      notify(id ? 'Product updated.' : 'Product added.');
      if (id) { await load(); setBusy(false); } else navigate(`/admin/products/${productId}`, { replace: true });
    } catch (err) { setErrors(err.fields); notify(err.message, 'danger'); setBusy(false); }
  };

  const imageAction = async (path, method, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    try { notify((await api(path, { method })).message); await load(); } catch (e) { notify(e.message, 'danger'); }
  };
  const move = async (index, dir) => {
    const list = [...images];
    const [item] = list.splice(index, 1);
    list.splice(index + dir, 0, item);
    setImages(list);
    await api(`/admin/products/${id}/images/order`, { method: 'POST', body: { ids: list.map((i) => i.id) } }).catch((e) => notify(e.message, 'danger'));
  };

  return (
    <form onSubmit={submit} noValidate>
      <Link to="/admin/products" className="small"><i className="bi bi-arrow-left" /> All products</Link>
      <div className="row g-4 mt-1">
        <div className="col-xl-7">
          <div className="card mb-4">
            <div className="card-header"><strong>Product details</strong></div>
            <div className="card-body row g-3">
              <div className="col-12"><label className="form-label" htmlFor="f-name">Product name *</label><input {...bind('name')} /><FieldError msg={errors.name} /></div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="f-category_id">Category *</label>
                <select {...bind('category_id')} className={`form-select${errors.category_id ? ' is-invalid' : ''}`}>
                  <option value="">Choose…</option>
                  {cats?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status !== 'active' ? ' (inactive)' : ''}</option>)}
                </select>
                <FieldError msg={errors.category_id} />
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="f-status">Status</label>
                <select {...bind('status')} className="form-select"><option value="active">Active (shown on website)</option><option value="inactive">Inactive (hidden)</option></select>
              </div>
              <div className="col-md-4"><label className="form-label" htmlFor="f-price">Selling price (₹) *</label><input type="number" step="0.01" min="0" {...bind('price')} /><FieldError msg={errors.price} /></div>
              <div className="col-md-4"><label className="form-label" htmlFor="f-original_price">MRP (₹)</label><input type="number" step="0.01" min="0" {...bind('original_price')} /><div className="form-text">Optional. Shows a discount.</div><FieldError msg={errors.original_price} /></div>
              <div className="col-md-4"><label className="form-label" htmlFor="f-stock_quantity">Stock *</label><input type="number" min="0" {...bind('stock_quantity')} /><FieldError msg={errors.stock_quantity} /></div>
              <div className="col-md-3"><label className="form-label" htmlFor="f-material">Material</label><input {...bind('material')} placeholder="e.g. Brass" /></div>
              <div className="col-md-3"><label className="form-label" htmlFor="f-colour">Colour</label><input {...bind('colour')} placeholder="e.g. Gold" /></div>
              <div className="col-md-3"><label className="form-label" htmlFor="f-size">Size</label><input {...bind('size')} placeholder="e.g. 2.4" /></div>
              <div className="col-md-3"><label className="form-label" htmlFor="f-weight">Weight</label><input {...bind('weight')} placeholder="e.g. 25 g" /></div>
              <div className="col-12"><label className="form-label" htmlFor="f-description">Description</label><textarea rows="5" {...bind('description')} /></div>
              <div className="col-12"><label className="form-label" htmlFor="f-meta_description">Google description <span className="small text-muted">(optional, up to 300 letters)</span></label><input maxLength={300} {...bind('meta_description')} /></div>
            </div>
          </div>
        </div>

        <div className="col-xl-5">
          <div className="card mb-4">
            <div className="card-header"><strong>Photos</strong> <span className="small text-muted">(first photo is the main one)</span></div>
            <div className="card-body">
              {images.length > 0 && (
                <div className="row row-cols-3 g-2 mb-3">
                  {images.map((img, i) => (
                    <div className="col" key={img.id}>
                      <div className={`image-tile ${i === 0 ? 'main' : ''}`}>
                        <img src={imageUrl(img.thumb_key || img.image_key)} alt="" />
                        <div className="d-flex justify-content-between p-1">
                          <button type="button" className="btn btn-sm btn-link p-0" disabled={i === 0} onClick={() => move(i, -1)} title="Move left"><i className="bi bi-arrow-left" /></button>
                          {i !== 0 && <button type="button" className="btn btn-sm btn-link p-0" onClick={() => imageAction(`/admin/images/${img.id}/main`, 'POST')} title="Make main photo"><i className="bi bi-star" /></button>}
                          <button type="button" className="btn btn-sm btn-link p-0 text-danger" onClick={() => imageAction(`/admin/images/${img.id}`, 'DELETE', 'Delete this photo?')} title="Delete"><i className="bi bi-trash" /></button>
                          <button type="button" className="btn btn-sm btn-link p-0" disabled={i === images.length - 1} onClick={() => move(i, 1)} title="Move right"><i className="bi bi-arrow-right" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <input type="file" className="form-control" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setNewPhotos([...e.target.files].slice(0, 10))} />
              <div className="form-text">JPG, PNG or WEBP. Photos are resized automatically. Square photos look best. {newPhotos.length > 0 && <strong className="text-gold">{newPhotos.length} new photo(s) will be uploaded when you save.</strong>}</div>
              {uploading && <div className="small text-gold mt-2"><span className="spinner-border spinner-border-sm" /> {uploading}</div>}
            </div>
          </div>
        </div>
      </div>
      <div className="admin-savebar d-flex gap-2">
        <button className="btn btn-gold px-4" disabled={busy}>{busy ? 'Saving…' : 'Save Product'}</button>
        <Link className="btn btn-outline-dark" to="/admin/products">Cancel</Link>
      </div>
    </form>
  );
}

export function Categories() {
  useAdminTitle('Categories');
  const { notify, refresh } = useShop();
  const { data, error, loading, reload } = useApi('/admin/categories');
  const [editing, setEditing] = useState(null); // category object or {} for new
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({});
    const fd = new FormData(e.target);
    const file = fd.get('image');
    if (file && file.size) fd.set('image', await resizedForUpload(file, 600)); else fd.delete('image');
    try {
      notify((await api(editing.id ? `/admin/categories/${editing.id}` : '/admin/categories', { method: editing.id ? 'PUT' : 'POST', form: fd })).message);
      setEditing(null); reload(); refresh();
    } catch (err) { setErrors(err.fields); notify(err.message, 'danger'); }
    setBusy(false);
  };
  const remove = async (c) => {
    if (!window.confirm(`Delete category "${c.name}"?`)) return;
    try { notify((await api(`/admin/categories/${c.id}`, { method: 'DELETE' })).message); reload(); refresh(); } catch (e) { notify(e.message, 'danger'); }
  };

  return (
    <div className="row g-4">
      <div className="col-xl-7">
        {loading && !data && <Loading />}
        {error && <ErrorBox error={error} onRetry={reload} />}
        {data && (
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center"><strong>Categories</strong><button className="btn btn-sm btn-gold" onClick={() => setEditing({})}><i className="bi bi-plus-lg" /> Add</button></div>
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead><tr><th>Category</th><th>Order</th><th>Products</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {data.categories.map((c) => (
                    <tr key={c.id}>
                      <td className="d-flex align-items-center gap-2">{c.image_key ? <img src={imageUrl(c.image_key)} className="admin-thumb" alt="" /> : <span className="admin-thumb d-inline-block" />}{c.name}</td>
                      <td>{c.display_order}</td>
                      <td><Link to={`/admin/products?category=${c.id}`}>{c.product_count}</Link></td>
                      <td><span className={`badge text-bg-${c.status === 'active' ? 'success' : 'secondary'}`}>{c.status}</span></td>
                      <td className="text-end text-nowrap">
                        <button className="btn btn-sm btn-outline-dark me-1" onClick={() => setEditing(c)}><i className="bi bi-pencil" /></button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => remove(c)}><i className="bi bi-trash" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <div className="col-xl-5">
        {editing && (
          <form className="card" onSubmit={save} key={editing.id || 'new'}>
            <div className="card-header"><strong>{editing.id ? `Edit "${editing.name}"` : 'New category'}</strong></div>
            <div className="card-body">
              <div className="mb-3"><label className="form-label">Name *</label><input name="name" className={`form-control${errors.name ? ' is-invalid' : ''}`} defaultValue={editing.name || ''} required /><FieldError msg={errors.name} /></div>
              <div className="row g-3 mb-3">
                <div className="col-6"><label className="form-label">Display order</label><input name="display_order" type="number" className="form-control" defaultValue={editing.display_order ?? 0} /></div>
                <div className="col-6"><label className="form-label">Status</label><select name="status" className="form-select" defaultValue={editing.status || 'active'}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
              </div>
              <label className="form-label">Image</label>
              {editing.image_key && (
                <div className="d-flex align-items-center gap-3 mb-2">
                  <img src={imageUrl(editing.image_key)} className="admin-thumb lg" alt="" />
                  <div className="form-check"><input type="checkbox" className="form-check-input" name="remove_image" value="1" id="rmCat" /><label className="form-check-label small" htmlFor="rmCat">Remove</label></div>
                </div>
              )}
              <input type="file" name="image" className="form-control" accept="image/jpeg,image/png,image/webp" />
            </div>
            <div className="card-footer d-flex gap-2"><button className="btn btn-gold" disabled={busy}>Save</button><button type="button" className="btn btn-outline-dark" onClick={() => setEditing(null)}>Cancel</button></div>
          </form>
        )}
      </div>
    </div>
  );
}
