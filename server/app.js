// The shop's API, served by Cloudflare Pages Functions at /api/*.
import { Hono } from 'hono';
import { PAGES, PUBLIC_SETTINGS, STATES } from '../shared/constants.js';
import { adminRoutes } from './admin.js';
import * as auth from './auth.js';
import * as catalog from './catalog.js';
import * as delivery from './delivery.js';
import { verifyIdToken } from './firebase.js';
import { resetEmail, sendMail } from './mail.js';
import * as orders from './orders.js';
import * as razorpay from './razorpay.js';
import { getSettings } from './settings.js';
import { HttpError, fail, int, now, optStr, randomToken, sha256Hex, str } from './util.js';

const app = new Hono().basePath('/api');

// ---------- Middleware ----------

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, fields: err.fields }, err.status);
  console.error(err);
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
});
app.notFound((c) => c.json({ error: 'Not found.' }, 404));

// Callbacks posted by Razorpay / Borzo from their own servers (verified by signature instead).
const EXTERNAL = ['/api/payment/webhook', '/api/delivery/borzo/webhook'];

app.use('*', async (c, next) => {
  // CSRF protection: our own pages always send this header; other websites cannot.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !EXTERNAL.includes(c.req.path) && c.req.header('X-Requested-With') !== 'fetch') {
    return c.json({ error: 'Invalid request.' }, 403);
  }
  c.set('user', await auth.loadUser(c));
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
});

const body = async (c) => { try { return await c.req.json(); } catch { return {}; } };

// ---------- Site-wide data ----------

app.get('/bootstrap', async (c) => {
  const s = await getSettings(c);
  const user = c.get('user');
  const wishlist = user ? (await c.env.DB.prepare('SELECT product_id FROM wishlists WHERE user_id=?').bind(user.id).all()).results.map((r) => r.product_id) : [];
  return c.json({
    settings: Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, s[k] ?? ''])),
    user: auth.publicUser(user),
    categories: await catalog.activeCategories(c.env),
    wishlist,
  });
});

app.get('/home', async (c) => {
  const [categories, newArrivals, bestSellers, offers] = await Promise.all([
    catalog.activeCategories(c.env), catalog.newArrivals(c.env), catalog.bestSellers(c.env), catalog.offers(c.env),
  ]);
  return c.json({ categories, newArrivals, bestSellers, offers });
});

app.get('/categories', async (c) => c.json({ categories: await catalog.activeCategories(c.env, true) }));

app.get('/products', async (c) => {
  const q = c.req.query();
  const result = await catalog.browse(c.env, q);
  let category = null;
  if (q.category) category = await c.env.DB.prepare("SELECT id, name, slug, image_key FROM categories WHERE slug=? AND status='active'").bind(q.category).first();
  return c.json({ ...result, category });
});

app.get('/products/:slug', async (c) => {
  const product = await catalog.productBySlug(c.env, c.req.param('slug'));
  if (!product) fail(404, 'Product not found.');
  return c.json({ product, related: await catalog.related(c.env, product) });
});

// ---------- Cart (kept in the browser; priced here) ----------

app.post('/cart/quote', async (c) => {
  const { items } = await body(c);
  const s = await getSettings(c);
  const quote = await orders.priceCart(c.env, items);
  return c.json({ ...quote, deliveryEstimate: delivery.estimate(c.env, s, quote.totals.total), deliveryArea: s.delivery_area_name });
});

// ---------- Accounts ----------

app.get('/me', (c) => c.json({ user: auth.publicUser(c.get('user')) }));

app.post('/auth/register', async (c) => {
  await auth.rateLimit(c, 'register', 10, 3600);
  const b = await body(c);
  const fields = {};
  const name = str(b.name, 100);
  const email = str(b.email, 190).toLowerCase();
  const mobile = str(b.mobile, 15).replace(/\D/g, '');
  if (name.length < 2) fields.name = 'Please enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Please enter a valid email address.';
  if (!/^[6-9]\d{9}$/.test(mobile)) fields.mobile = 'Please enter a valid 10-digit mobile number.';
  const pw = auth.validatePassword(b.password);
  if (pw) fields.password = pw;
  else if (b.password !== b.password_confirmation) fields.password_confirmation = 'Passwords do not match.';
  if (Object.keys(fields).length) fail(422, 'Please check the form.', fields);

  if (await c.env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first()) fail(422, 'Please check the form.', { email: 'An account with this email already exists. Please log in.' });
  const t = now();
  const user = await c.env.DB.prepare("INSERT INTO users (name, email, mobile, password_hash, role, created_at, updated_at) VALUES (?,?,?,?, 'CUSTOMER', ?, ?) RETURNING id, name, email, mobile, role")
    .bind(name, email, mobile, await auth.hashPassword(b.password), t, t).first();
  await auth.startSession(c, user.id);
  return c.json({ user: auth.publicUser(user) });
});

app.post('/auth/login', async (c) => {
  await auth.rateLimit(c, 'login', 10, 600);
  const b = await body(c);
  const email = str(b.email, 190).toLowerCase();
  const password = String(b.password || '');
  let user = await c.env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();

  // First admin: created from the ADMIN_EMAIL / ADMIN_PASSWORD secrets the first time they log in.
  if (c.env.ADMIN_EMAIL && c.env.ADMIN_PASSWORD && email === c.env.ADMIN_EMAIL.toLowerCase() && password === c.env.ADMIN_PASSWORD
      && !(await c.env.DB.prepare("SELECT 1 FROM users WHERE role='ADMIN'").first())) {
    const t = now();
    const hash = await auth.hashPassword(password);
    if (user) await c.env.DB.prepare("UPDATE users SET role='ADMIN', password_hash=?, updated_at=? WHERE id=?").bind(hash, t, user.id).run();
    else await c.env.DB.prepare("INSERT INTO users (name, email, password_hash, role, created_at, updated_at) VALUES (?,?,?, 'ADMIN', ?, ?)").bind(c.env.ADMIN_NAME || 'Shop Owner', email, hash, t, t).run();
    user = await c.env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  }

  if (!user || !(await auth.verifyPassword(password, user.password_hash))) fail(422, 'These details do not match our records.', { email: 'These details do not match our records.' });
  if (b.adminOnly && user.role !== 'ADMIN') fail(403, 'This account is not an admin account.');
  await auth.startSession(c, user.id);
  return c.json({ user: auth.publicUser(user) });
});

// Google / email sign-in through Firebase: the browser sends Firebase's ID token, we verify it
// and start our own session. Accounts are matched by Firebase uid, then by verified email.
app.post('/auth/firebase', async (c) => {
  await auth.rateLimit(c, 'firebase-login', 20, 600);
  const b = await body(c);
  const claims = await verifyIdToken(c.env, b.idToken);
  if (!claims) fail(401, 'Sign-in could not be verified. Please try again.');
  const email = str(claims.email, 190).toLowerCase();
  if (!email) fail(422, 'Your sign-in account has no email address.');
  if (!claims.email_verified) fail(403, 'Please verify your email first. We have sent you a verification link.', { needsVerification: true });

  const db = c.env.DB;
  let user = await db.prepare('SELECT * FROM users WHERE firebase_uid=?').bind(claims.sub).first();
  if (!user) {
    user = await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
    if (user && user.role === 'ADMIN') fail(403, 'Admin accounts must log in at /admin/login.');
    const t = now();
    if (user) {
      await db.prepare('UPDATE users SET firebase_uid=?, updated_at=? WHERE id=?').bind(claims.sub, t, user.id).run();
    } else {
      const name = str(b.name || claims.name || email.split('@')[0], 100) || 'Customer';
      const mobile = str(b.mobile, 15).replace(/\D/g, '');
      user = await db.prepare(`INSERT INTO users (name, email, mobile, password_hash, role, firebase_uid, created_at, updated_at)
        VALUES (?,?,?,'!firebase', 'CUSTOMER', ?, ?, ?) RETURNING *`)
        .bind(name, email, /^[6-9]\d{9}$/.test(mobile) ? mobile : null, claims.sub, t, t).first();
    }
  }
  if (user.role === 'ADMIN') fail(403, 'Admin accounts must log in at /admin/login.');
  await auth.startSession(c, user.id);
  return c.json({ user: auth.publicUser(user) });
});

app.post('/auth/logout', async (c) => { await auth.endSession(c); return c.json({ ok: true }); });

app.post('/auth/forgot', async (c) => {
  await auth.rateLimit(c, 'forgot', 5, 3600);
  const email = str((await body(c)).email, 190).toLowerCase();
  const user = await c.env.DB.prepare('SELECT id, email FROM users WHERE email=?').bind(email).first();
  if (user) {
    const token = randomToken(32);
    await c.env.DB.prepare('DELETE FROM password_resets WHERE user_id=?').bind(user.id).run();
    await c.env.DB.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?,?,?)')
      .bind(await sha256Hex(token), user.id, new Date(Date.now() + 3600000).toISOString()).run();
    const s = await getSettings(c);
    const url = `${new URL(c.req.url).origin}/reset-password?token=${token}`;
    c.executionCtx.waitUntil(sendMail(c.env, { to: user.email, ...resetEmail(s, url) }));
  }
  // Same answer either way, so nobody can find out which emails have accounts.
  return c.json({ message: 'If an account exists for this email, we have sent a password reset link.' });
});

app.post('/auth/reset', async (c) => {
  await auth.rateLimit(c, 'reset', 10, 3600);
  const b = await body(c);
  const pw = auth.validatePassword(b.password);
  if (pw) fail(422, pw, { password: pw });
  if (b.password !== b.password_confirmation) fail(422, 'Passwords do not match.', { password_confirmation: 'Passwords do not match.' });
  const row = await c.env.DB.prepare('SELECT * FROM password_resets WHERE token_hash=?').bind(await sha256Hex(String(b.token || ''))).first();
  if (!row || row.expires_at < now()) fail(422, 'This reset link is invalid or has expired. Please ask for a new one.');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash=?, updated_at=? WHERE id=?').bind(await auth.hashPassword(b.password), now(), row.user_id),
    c.env.DB.prepare('DELETE FROM password_resets WHERE user_id=?').bind(row.user_id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(row.user_id),
  ]);
  return c.json({ message: 'Your password has been reset. Please log in.' });
});

app.put('/profile', async (c) => {
  const user = auth.requireUser(c);
  const b = await body(c);
  const name = str(b.name, 100);
  const mobile = str(b.mobile, 15).replace(/\D/g, '');
  const fields = {};
  if (name.length < 2) fields.name = 'Please enter your name.';
  if (mobile && !/^[6-9]\d{9}$/.test(mobile)) fields.mobile = 'Please enter a valid 10-digit mobile number.';
  if (Object.keys(fields).length) fail(422, 'Please check the form.', fields);
  await c.env.DB.prepare('UPDATE users SET name=?, mobile=?, updated_at=? WHERE id=?').bind(name, mobile || null, now(), user.id).run();
  return c.json({ user: auth.publicUser({ ...user, name, mobile }), message: 'Profile updated.' });
});

app.put('/profile/password', async (c) => {
  const user = auth.requireUser(c);
  const b = await body(c);
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id=?').bind(user.id).first();
  if (!(await auth.verifyPassword(String(b.current_password || ''), row.password_hash))) fail(422, 'Your current password is not correct.', { current_password: 'Not correct.' });
  const pw = auth.validatePassword(b.password);
  if (pw) fail(422, pw, { password: pw });
  if (b.password !== b.password_confirmation) fail(422, 'Passwords do not match.', { password_confirmation: 'Passwords do not match.' });
  await c.env.DB.prepare('UPDATE users SET password_hash=?, updated_at=? WHERE id=?').bind(await auth.hashPassword(b.password), now(), user.id).run();
  return c.json({ message: 'Password changed.' });
});

// ---------- Addresses ----------

function validateAddress(b) {
  const a = {
    full_name: str(b.full_name, 100), mobile: str(b.mobile, 15).replace(/\D/g, ''), house: str(b.house, 190),
    street: optStr(b.street, 190), area: optStr(b.area, 190), city: str(b.city, 100), state: str(b.state, 100), pincode: str(b.pincode, 6),
  };
  const f = {};
  if (a.full_name.length < 2) f.full_name = 'Please enter the full name.';
  if (!/^[6-9]\d{9}$/.test(a.mobile)) f.mobile = 'Please enter a valid 10-digit mobile number.';
  if (!a.house) f.house = 'Please enter the house / flat number.';
  if (!a.city) f.city = 'Please enter the city.';
  if (!STATES.includes(a.state)) f.state = 'Please choose a state.';
  if (!/^[1-9]\d{5}$/.test(a.pincode)) f.pincode = 'Please enter a valid 6-digit pincode.';
  if (Object.keys(f).length) fail(422, 'Please check the address.', f);
  return a;
}

const userAddresses = async (env, userId) => (await env.DB.prepare('SELECT * FROM addresses WHERE user_id=? ORDER BY is_default DESC, id DESC').bind(userId).all()).results;

async function ownAddress(c, id) {
  const user = auth.requireUser(c);
  const a = await c.env.DB.prepare('SELECT * FROM addresses WHERE id=? AND user_id=?').bind(int(id), user.id).first();
  if (!a) fail(404, 'Address not found.');
  return a;
}

async function insertAddress(env, userId, a, makeDefault) {
  const t = now();
  const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM addresses WHERE user_id=?').bind(userId).first()).n;
  if (count >= 20) fail(422, 'You can save up to 20 addresses. Please delete an old one.');
  const isDefault = makeDefault || count === 0 ? 1 : 0;
  if (isDefault) await env.DB.prepare('UPDATE addresses SET is_default=0 WHERE user_id=?').bind(userId).run();
  return env.DB.prepare(`INSERT INTO addresses (user_id, full_name, mobile, house, street, area, city, state, pincode, is_default, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`).bind(userId, a.full_name, a.mobile, a.house, a.street, a.area, a.city, a.state, a.pincode, isDefault, t, t).first();
}

app.get('/addresses', async (c) => c.json({ addresses: await userAddresses(c.env, auth.requireUser(c).id) }));
app.get('/addresses/:id', async (c) => c.json({ address: await ownAddress(c, c.req.param('id')) }));

app.post('/addresses', async (c) => {
  const user = auth.requireUser(c);
  const b = await body(c);
  return c.json({ address: await insertAddress(c.env, user.id, validateAddress(b), Boolean(b.is_default)) });
});

app.put('/addresses/:id', async (c) => {
  const existing = await ownAddress(c, c.req.param('id'));
  const b = await body(c);
  const a = validateAddress(b);
  if (b.is_default) await c.env.DB.prepare('UPDATE addresses SET is_default=0 WHERE user_id=?').bind(existing.user_id).run();
  await c.env.DB.prepare('UPDATE addresses SET full_name=?, mobile=?, house=?, street=?, area=?, city=?, state=?, pincode=?, is_default=?, updated_at=? WHERE id=?')
    .bind(a.full_name, a.mobile, a.house, a.street, a.area, a.city, a.state, a.pincode, b.is_default ? 1 : existing.is_default, now(), existing.id).run();
  return c.json({ message: 'Address updated.' });
});

app.delete('/addresses/:id', async (c) => {
  const a = await ownAddress(c, c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM addresses WHERE id=?').bind(a.id).run();
  if (a.is_default) await c.env.DB.prepare('UPDATE addresses SET is_default=1 WHERE id=(SELECT id FROM addresses WHERE user_id=? ORDER BY id DESC LIMIT 1)').bind(a.user_id).run();
  return c.json({ message: 'Address deleted.' });
});

app.post('/addresses/:id/default', async (c) => {
  const a = await ownAddress(c, c.req.param('id'));
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE addresses SET is_default=0 WHERE user_id=?').bind(a.user_id),
    c.env.DB.prepare('UPDATE addresses SET is_default=1 WHERE id=?').bind(a.id),
  ]);
  return c.json({ message: 'Default address updated.' });
});

// ---------- Wishlist ----------

app.get('/wishlist', async (c) => {
  const user = auth.requireUser(c);
  const { results } = await c.env.DB.prepare(
    `SELECT ${catalog.CARD_COLUMNS}, p.status, c.status AS category_status FROM wishlists w JOIN products p ON p.id = w.product_id
     JOIN categories c ON c.id = p.category_id WHERE w.user_id=? ORDER BY w.created_at DESC`,
  ).bind(user.id).all();
  return c.json({ products: results });
});

app.post('/wishlist/:productId', async (c) => {
  const user = auth.requireUser(c);
  const id = int(c.req.param('productId'));
  if (!(await c.env.DB.prepare('SELECT 1 FROM products WHERE id=?').bind(id).first())) fail(404, 'Product not found.');
  await c.env.DB.prepare('INSERT OR IGNORE INTO wishlists (user_id, product_id, created_at) VALUES (?,?,?)').bind(user.id, id, now()).run();
  return c.json({ message: 'Added to your wishlist.' });
});

app.delete('/wishlist/:productId', async (c) => {
  const user = auth.requireUser(c);
  await c.env.DB.prepare('DELETE FROM wishlists WHERE user_id=? AND product_id=?').bind(user.id, int(c.req.param('productId'))).run();
  return c.json({ message: 'Removed from your wishlist.' });
});

// ---------- Checkout & orders ----------

app.post('/checkout', async (c) => {
  const user = auth.requireUser(c);
  await auth.rateLimit(c, `checkout-${user.id}`, 10, 60);
  const b = await body(c);
  const s = await getSettings(c);

  let address;
  if (b.addressId && b.addressId !== 'new') {
    address = await c.env.DB.prepare('SELECT * FROM addresses WHERE id=? AND user_id=?').bind(int(b.addressId), user.id).first();
    if (!address) fail(422, 'Please choose a delivery address.');
    delivery.assertDeliverable(s, address.pincode);
  } else {
    const a = validateAddress(b.address || {});
    delivery.assertDeliverable(s, a.pincode);
    address = await insertAddress(c.env, user.id, a, false);
  }

  const order = await orders.createOrder(c, user, address, b.items);
  const fresh = await orders.getOrder(c.env, order.id);
  return c.json({ orderId: order.id, orderNumber: order.order_number, payment: await orders.startPayment(c, fresh, user) });
});

app.get('/orders', async (c) => {
  const user = auth.requireUser(c);
  const { results } = await c.env.DB.prepare(
    `SELECT o.id, o.order_number, o.total_amount, o.payment_status, o.order_status, o.created_at,
       (SELECT SUM(quantity) FROM order_items WHERE order_id=o.id) AS item_count
     FROM orders o WHERE o.user_id=? ORDER BY o.id DESC LIMIT 100`,
  ).bind(user.id).all();
  return c.json({ orders: results });
});

async function ownOrder(c) {
  const user = auth.requireUser(c);
  const order = await orders.getOrder(c.env, int(c.req.param('id')));
  if (!order || order.user_id !== user.id) fail(404, 'Order not found.');
  return { user, order };
}

app.get('/orders/:id', async (c) => {
  const { order } = await ownOrder(c);
  const { results: items } = await c.env.DB.prepare(
    `SELECT oi.*, p.slug, (SELECT COALESCE(thumb_key, image_key) FROM product_images i WHERE i.product_id = oi.product_id ORDER BY display_order, id LIMIT 1) AS thumb_key
     FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id=? ORDER BY oi.id`,
  ).bind(order.id).all();
  const { admin_note, delivery_cost, ...visible } = order;
  return c.json({ order: { ...visible, can_be_paid: orders.canBePaid(order) }, items });
});

app.post('/orders/:id/pay', async (c) => {
  const { user, order } = await ownOrder(c);
  await auth.rateLimit(c, `pay-${user.id}`, 10, 60);
  return c.json({ payment: await orders.startPayment(c, order, user) });
});

// ---------- Payments (Razorpay) ----------

// The checkout popup reports a successful payment. We verify the signature AND ask Razorpay.
app.post('/orders/:id/payment/verify', async (c) => {
  const { order } = await ownOrder(c);
  const b = await body(c);
  const payment = await c.env.DB.prepare('SELECT transaction_id FROM payments WHERE order_id=? AND transaction_id=?').bind(order.id, String(b.razorpay_order_id || '')).first();
  if (!payment) fail(422, 'Unknown payment.');
  if (!(await razorpay.validCheckoutSignature(c.env, b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature))) {
    console.warn('Invalid Razorpay checkout signature', order.id);
    fail(422, 'We could not verify this payment. If money was taken, it will be confirmed automatically or refunded.');
  }
  const result = await razorpay.fetchPayment(c.env, b.razorpay_order_id, String(b.razorpay_payment_id));
  const fresh = await orders.applyPaymentResult(c, result);
  return c.json({ status: fresh?.payment_status === 'paid' ? 'success' : result.status === razorpay.PENDING ? 'pending' : 'failed' });
});

// Popup closed or failed: ask Razorpay what happened to the latest attempt.
app.post('/orders/:id/payment/sync', async (c) => {
  const { order } = await ownOrder(c);
  const p = await c.env.DB.prepare("SELECT transaction_id FROM payments WHERE order_id=? AND status='pending' ORDER BY id DESC LIMIT 1").bind(order.id).first();
  if (p && razorpay.razorpayConfigured(c.env)) await orders.applyPaymentResult(c, await razorpay.fetchStatus(c.env, p.transaction_id));
  const fresh = await orders.getOrder(c.env, order.id);
  return c.json({ status: fresh.payment_status === 'paid' ? 'success' : fresh.payment_status === 'failed' ? 'failed' : 'pending' });
});

// Razorpay webhook (Dashboard → Webhooks): events payment.captured, payment.failed, order.paid.
app.post('/payment/webhook', async (c) => {
  const raw = await c.req.text();
  if (!(await razorpay.validWebhookSignature(c.env, raw, c.req.header('X-Razorpay-Signature')))) return c.text('Invalid signature', 400);
  let event = {};
  try { event = JSON.parse(raw); } catch { /* ignore */ }
  const rzpOrderId = event?.payload?.payment?.entity?.order_id || event?.payload?.order?.entity?.id;
  if (rzpOrderId) {
    const known = await c.env.DB.prepare('SELECT 1 FROM payments WHERE transaction_id=?').bind(rzpOrderId).first();
    if (known) await orders.applyPaymentResult(c, await razorpay.fetchStatus(c.env, rzpOrderId)); // never trust the webhook body alone
  }
  return c.text('OK');
});

// ---------- Borzo delivery callbacks ----------
// Set in Borzo → Integration → Callback URL: https://yourdomain/api/delivery/borzo/webhook
app.post('/delivery/borzo/webhook', async (c) => {
  const raw = await c.req.text();
  if (!(await delivery.validCallbackSignature(c.env, raw, c.req.header('X-DV-Signature')))) return c.text('Invalid signature', 400);
  let payload = {};
  try { payload = JSON.parse(raw); } catch { /* ignore */ }

  let borzoOrder = payload?.order?.order_id ? payload.order : null;
  if (!borzoOrder && payload?.delivery?.order_id) {
    try { borzoOrder = await delivery.fetchBorzoOrder(c.env, payload.delivery.order_id); } catch (e) { console.warn('Borzo refresh after callback failed', e.message); }
  }
  if (borzoOrder) {
    const { order, target } = await delivery.applyBorzoOrder(c.env, borzoOrder);
    if (order && target) await orders.updateStatus(c, order, target);
  }
  return c.text('OK');
});

// ---------- Static pages ----------
app.get('/pages/:slug', async (c) => {
  const page = PAGES[c.req.param('slug')];
  if (!page) fail(404, 'Page not found.');
  const s = await getSettings(c);
  return c.json({ title: page.title, content: page.setting ? s[page.setting] : null });
});

app.route('/admin', adminRoutes);

export default app;
