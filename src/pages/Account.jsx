import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { AddressFields, EMPTY_ADDRESS, addressLine } from '../components/AddressFields.jsx';
import { ProductGrid } from '../components/ProductCard.jsx';
import { Empty, ErrorBox, FieldError, Loading } from '../components/Ui.jsx';
import { useShop } from '../context/ShopContext.jsx';
import { setTitle } from '../format.js';
import { useApi, useForm } from '../hooks.js';

/** Wraps pages that need a logged-in customer. */
export function RequireAuth({ children }) {
  const { user, ready } = useShop();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function useTitle(title) {
  const { settings } = useShop();
  useEffect(() => { setTitle(title, settings.shop_name); }, [title, settings.shop_name]);
}

/** Loads the Firebase helpers only when a login page is opened. */
const fb = () => import('../firebase.js');
const FIREBASE_ON = Boolean(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID);

function GoogleButton({ onDone, setError, label = 'Continue with Google' }) {
  const [busy, setBusy] = useState(false);
  if (!FIREBASE_ON) return null;
  const click = async () => {
    setBusy(true); setError('');
    const f = await fb();
    try { onDone((await f.signInWithGoogle()).user); } catch (e) { setError(e.status ? e.message : f.friendlyError(e)); setBusy(false); }
  };
  return (
    <>
      <button type="button" className="btn btn-light w-100 d-flex align-items-center justify-content-center gap-2" onClick={click} disabled={busy}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        {busy ? 'Please wait…' : label}
      </button>
      <div className="d-flex align-items-center gap-2 my-3 small text-muted"><hr className="flex-grow-1 m-0" />or with email<hr className="flex-grow-1 m-0" /></div>
    </>
  );
}

export function Login() {
  useTitle('Login');
  const { user, setUser, refresh, notify } = useShop();
  const navigate = useNavigate();
  const location = useLocation();
  const f = useForm({ email: '', password: '' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState(location.state?.info || '');
  const to = location.state?.from || '/';
  if (user) return <Navigate to={to} replace />;

  const done = async (u) => {
    setUser(u);
    await refresh();
    notify(`Welcome, ${u.name}!`);
    navigate(to, { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    f.setBusy(true); setError(''); setInfo('');
    try {
      if (FIREBASE_ON) {
        let extra = {};
        try { const p = JSON.parse(sessionStorage.getItem('pendingProfile') || 'null'); if (p && p.email === f.values.email.trim().toLowerCase()) extra = { name: p.name, mobile: p.mobile }; } catch { /* ignore */ }
        const r = await (await fb()).signInWithEmail(f.values.email.trim(), f.values.password, extra);
        if (r.needsVerification) { setInfo('Please verify your email first. We have sent a new verification link – open it, then log in again.'); f.setBusy(false); return; }
        try { sessionStorage.removeItem('pendingProfile'); } catch { /* ignore */ }
        await done(r.user);
      } else {
        await done((await api('/auth/login', { method: 'POST', body: f.values })).user);
      }
    } catch (err) {
      setError(err.status !== undefined ? err.message : (await fb()).friendlyError(err));
      f.setBusy(false);
    }
  };

  return (
    <div className="container py-5">
      <div className="auth-box">
        <h1 className="page-title text-center">Login</h1>
        {error && <div className="alert alert-danger small">{error}</div>}
        {info && <div className="alert alert-info small">{info}</div>}
        <GoogleButton onDone={done} setError={setError} />
        <form onSubmit={submit}>
          <div className="mb-3"><label className="form-label">Email</label><input type="email" autoComplete="email" required {...f.bind('email')} /></div>
          <div className="mb-2"><label className="form-label">Password</label><input type="password" autoComplete="current-password" required {...f.bind('password')} /></div>
          <div className="text-end mb-3"><Link to="/forgot-password" className="small">Forgot password?</Link></div>
          <button className="btn btn-gold w-100" disabled={f.busy}>{f.busy ? 'Please wait…' : 'Login'}</button>
        </form>
        <p className="text-center small mt-3 mb-0">New here? <Link to="/register" state={location.state}>Create an account</Link></p>
      </div>
    </div>
  );
}

export function Register() {
  useTitle('Create account');
  const { user, setUser, refresh, notify } = useShop();
  const navigate = useNavigate();
  const location = useLocation();
  const f = useForm({ name: '', email: '', mobile: '', password: '', password_confirmation: '' });
  const [error, setError] = useState('');
  const to = location.state?.from || '/';
  if (user) return <Navigate to={to} replace />;

  const done = async (u) => { setUser(u); await refresh(); notify(`Welcome, ${u.name}!`); navigate(to, { replace: true }); };

  const submit = async (e) => {
    e.preventDefault();
    f.setBusy(true); f.setErrors({}); setError('');
    const v = f.values;
    const errs = {};
    if (v.name.trim().length < 2) errs.name = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) errs.email = 'Please enter a valid email address.';
    if (v.mobile && !/^[6-9]\d{9}$/.test(v.mobile)) errs.mobile = 'Please enter a valid 10-digit mobile number.';
    if (v.password.length < 8 || !/[A-Za-z]/.test(v.password) || !/\d/.test(v.password)) errs.password = 'At least 8 characters, with letters and numbers.';
    else if (v.password !== v.password_confirmation) errs.password_confirmation = 'Passwords do not match.';
    if (Object.keys(errs).length) { f.setErrors(errs); f.setBusy(false); return; }
    try {
      if (FIREBASE_ON) {
        await (await fb()).registerWithEmail({ name: v.name.trim(), email: v.email.trim(), password: v.password });
        try { sessionStorage.setItem('pendingProfile', JSON.stringify({ email: v.email.trim().toLowerCase(), name: v.name.trim(), mobile: v.mobile })); } catch { /* ignore */ }
        navigate('/login', { replace: true, state: { from: to, info: `Account created! We have sent a verification link to ${v.email.trim()}. Open it (check spam too), then log in here.` } });
      } else {
        await done((await api('/auth/register', { method: 'POST', body: v })).user);
      }
    } catch (err) {
      if (err.status !== undefined) { f.setErrors(Object.keys(err.fields).length ? err.fields : { email: err.message }); }
      else setError((await fb()).friendlyError(err));
      f.setBusy(false);
    }
  };

  return (
    <div className="container py-5">
      <div className="auth-box">
        <h1 className="page-title text-center">Create account</h1>
        {error && <div className="alert alert-danger small">{error}</div>}
        <GoogleButton onDone={done} setError={setError} label="Sign up with Google" />
        <form onSubmit={submit} noValidate>
          <div className="mb-3"><label className="form-label">Full name</label><input autoComplete="name" {...f.bind('name')} /><FieldError msg={f.errors.name} /></div>
          <div className="mb-3"><label className="form-label">Email</label><input type="email" autoComplete="email" {...f.bind('email')} /><FieldError msg={f.errors.email} /></div>
          <div className="mb-3"><label className="form-label">Mobile number</label><input inputMode="numeric" maxLength={10} autoComplete="tel-national" {...f.bind('mobile')} /><FieldError msg={f.errors.mobile} /></div>
          <div className="mb-3"><label className="form-label">Password</label><input type="password" autoComplete="new-password" {...f.bind('password')} /><div className="form-text">At least 8 characters, with letters and numbers.</div><FieldError msg={f.errors.password} /></div>
          <div className="mb-3"><label className="form-label">Confirm password</label><input type="password" autoComplete="new-password" {...f.bind('password_confirmation')} /><FieldError msg={f.errors.password_confirmation} /></div>
          <button className="btn btn-gold w-100" disabled={f.busy}>{f.busy ? 'Please wait…' : 'Create account'}</button>
        </form>
        <p className="text-center small mt-3 mb-0">Already have an account? <Link to="/login" state={location.state}>Login</Link></p>
      </div>
    </div>
  );
}

export function ForgotPassword() {
  useTitle('Forgot password');
  const f = useForm({ email: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    f.setBusy(true); setError('');
    try {
      if (FIREBASE_ON) {
        await (await fb()).sendReset(f.values.email.trim()).catch((err) => { if (err?.code !== 'auth/user-not-found') throw err; });
        setMessage('If an account exists for this email, we have sent a password reset link. Please check your inbox (and spam).');
      } else {
        setMessage((await api('/auth/forgot', { method: 'POST', body: f.values })).message);
      }
    } catch (err) { setError(err.status !== undefined ? err.message : (await fb()).friendlyError(err)); }
    f.setBusy(false);
  };
  return (
    <div className="container py-5">
      <div className="auth-box">
        <h1 className="page-title text-center">Forgot password</h1>
        {message ? <div className="alert alert-success small">{message}</div> : (
          <form onSubmit={submit}>
            <p className="small text-muted">Enter your email and we will send you a link to set a new password. If you signed up with Google, just use “Continue with Google”.</p>
            {error && <div className="alert alert-danger small">{error}</div>}
            <div className="mb-3"><label className="form-label">Email</label><input type="email" required {...f.bind('email')} /></div>
            <button className="btn btn-gold w-100" disabled={f.busy}>Send reset link</button>
          </form>
        )}
        <p className="text-center small mt-3 mb-0"><Link to="/login">Back to login</Link></p>
      </div>
    </div>
  );
}

export function ResetPassword() {
  useTitle('Reset password');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { notify } = useShop();
  const f = useForm({ password: '', password_confirmation: '' });
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    f.setBusy(true); setError(''); f.setErrors({});
    try {
      const res = await api('/auth/reset', { method: 'POST', body: { ...f.values, token: params.get('token') } });
      notify(res.message);
      navigate('/login');
    } catch (err) { setError(err.message); f.setErrors(err.fields); f.setBusy(false); }
  };
  return (
    <div className="container py-5">
      <div className="auth-box">
        <h1 className="page-title text-center">Set a new password</h1>
        {error && <div className="alert alert-danger small">{error}</div>}
        <form onSubmit={submit}>
          <div className="mb-3"><label className="form-label">New password</label><input type="password" autoComplete="new-password" required {...f.bind('password')} /></div>
          <div className="mb-3"><label className="form-label">Confirm new password</label><input type="password" autoComplete="new-password" required {...f.bind('password_confirmation')} /></div>
          <button className="btn btn-gold w-100" disabled={f.busy}>Reset password</button>
        </form>
      </div>
    </div>
  );
}

export function Profile() {
  useTitle('My Profile');
  const { user, setUser, notify } = useShop();
  const p = useForm({ name: user.name, mobile: user.mobile || '' });
  const pw = useForm({ current_password: '', password: '', password_confirmation: '' });

  const saveProfile = async (e) => {
    e.preventDefault();
    p.setBusy(true); p.setErrors({});
    try { const res = await api('/profile', { method: 'PUT', body: p.values }); setUser(res.user); notify(res.message); } catch (err) { p.setErrors(err.fields); notify(err.message, 'danger'); }
    p.setBusy(false);
  };
  const savePassword = async (e) => {
    e.preventDefault();
    pw.setBusy(true); pw.setErrors({});
    try { notify((await api('/profile/password', { method: 'PUT', body: pw.values })).message); pw.setValues({ current_password: '', password: '', password_confirmation: '' }); } catch (err) { pw.setErrors(err.fields); notify(err.message, 'danger'); }
    pw.setBusy(false);
  };

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      <h1 className="page-title">My Profile</h1>
      <div className="row g-4">
        <div className="col-md-6">
          <form className="card-box" onSubmit={saveProfile}>
            <h2 className="h6 text-uppercase text-gold">Your details</h2>
            <div className="mb-3"><label className="form-label">Email</label><input className="form-control" value={user.email} disabled /></div>
            <div className="mb-3"><label className="form-label">Name</label><input {...p.bind('name')} /><FieldError msg={p.errors.name} /></div>
            <div className="mb-3"><label className="form-label">Mobile</label><input inputMode="numeric" maxLength={10} {...p.bind('mobile')} /><FieldError msg={p.errors.mobile} /></div>
            <button className="btn btn-gold" disabled={p.busy}>Save</button>
          </form>
        </div>
        <div className="col-md-6">
          {user.firebase ? (
            <div className="card-box"><h2 className="h6 text-uppercase text-gold">Password</h2><p className="small text-muted mb-2">You sign in with Google or with your email through our secure sign-in service.</p><Link to="/forgot-password" className="btn btn-outline-gold btn-sm">Reset my password</Link></div>
          ) : (
          <form className="card-box" onSubmit={savePassword}>
            <h2 className="h6 text-uppercase text-gold">Change password</h2>
            <div className="mb-3"><label className="form-label">Current password</label><input type="password" autoComplete="current-password" {...pw.bind('current_password')} /><FieldError msg={pw.errors.current_password} /></div>
            <div className="mb-3"><label className="form-label">New password</label><input type="password" autoComplete="new-password" {...pw.bind('password')} /><FieldError msg={pw.errors.password} /></div>
            <div className="mb-3"><label className="form-label">Confirm new password</label><input type="password" autoComplete="new-password" {...pw.bind('password_confirmation')} /><FieldError msg={pw.errors.password_confirmation} /></div>
            <button className="btn btn-outline-gold" disabled={pw.busy}>Change password</button>
          </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function Addresses() {
  useTitle('My Addresses');
  const { notify } = useShop();
  const { data, error, loading, reload } = useApi('/addresses');
  const act = async (path, method, msg) => {
    if (msg && !window.confirm(msg)) return;
    try { notify((await api(path, { method })).message); reload(); } catch (e) { notify(e.message, 'danger'); }
  };
  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="page-title mb-0">My Addresses</h1>
        <Link className="btn btn-gold btn-sm" to="/addresses/new"><i className="bi bi-plus" /> Add address</Link>
      </div>
      {loading && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && !data.addresses.length && <Empty icon="bi-geo-alt" title="No saved addresses"><p>Add one now or at checkout.</p></Empty>}
      <div className="row g-3">
        {data?.addresses.map((a) => (
          <div className="col-md-6" key={a.id}>
            <div className="card-box h-100">
              <strong>{a.full_name}</strong> · {a.mobile} {a.is_default ? <span className="badge text-bg-light">Default</span> : null}
              <p className="small text-muted my-2">{addressLine(a)}</p>
              <div className="d-flex gap-3 small">
                <Link to={`/addresses/${a.id}/edit`}>Edit</Link>
                {!a.is_default && <button className="btn btn-link p-0 small" onClick={() => act(`/addresses/${a.id}/default`, 'POST')}>Make default</button>}
                <button className="btn btn-link p-0 small text-danger" onClick={() => act(`/addresses/${a.id}`, 'DELETE', 'Delete this address?')}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AddressForm() {
  const { id } = useParams();
  useTitle(id ? 'Edit address' : 'Add address');
  const navigate = useNavigate();
  const { notify } = useShop();
  const [value, setValue] = useState(id ? null : { ...EMPTY_ADDRESS, is_default: false });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id) api(`/addresses/${id}`).then(({ address }) => setValue({ ...address, is_default: Boolean(address.is_default) })).catch((e) => { notify(e.message, 'danger'); navigate('/addresses'); });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!value) return <Loading />;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({});
    try {
      await api(id ? `/addresses/${id}` : '/addresses', { method: id ? 'PUT' : 'POST', body: value });
      notify(id ? 'Address updated.' : 'Address saved.');
      navigate('/addresses');
    } catch (err) { setErrors(err.fields); notify(err.message, 'danger'); setBusy(false); }
  };
  return (
    <div className="container py-4" style={{ maxWidth: 760 }}>
      <h1 className="page-title">{id ? 'Edit address' : 'Add address'}</h1>
      <form className="card-box" onSubmit={submit} noValidate>
        <AddressFields value={value} onChange={setValue} errors={errors} />
        <div className="form-check mt-3">
          <input className="form-check-input" type="checkbox" id="isDefault" checked={value.is_default} onChange={(e) => setValue({ ...value, is_default: e.target.checked })} />
          <label className="form-check-label" htmlFor="isDefault">Make this my default address</label>
        </div>
        <div className="mt-3 d-flex gap-2"><button className="btn btn-gold" disabled={busy}>Save address</button><Link className="btn btn-outline-dark" to="/addresses">Cancel</Link></div>
      </form>
    </div>
  );
}

export function Wishlist() {
  useTitle('My Wishlist');
  const { wishlist } = useShop();
  const { data, error, loading, reload } = useApi('/wishlist');
  useEffect(() => { reload(); }, [wishlist.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const products = data?.products.filter((p) => wishlist.includes(p.id) && p.status === 'active' && p.category_status === 'active') || [];
  return (
    <div className="container py-4">
      <h1 className="page-title">My Wishlist</h1>
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (products.length ? <ProductGrid products={products} /> : (
        <Empty icon="bi-heart" title="Your wishlist is empty"><p>Tap the heart on any product to save it here.</p><Link className="btn btn-gold" to="/products">Browse jewellery</Link></Empty>
      ))}
    </div>
  );
}
