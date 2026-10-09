// Admin panel API: /api/admin/*  (admins only)
import { Hono } from 'hono';
import { ORDER_STATUS, PAYMENT_STATUS, PENDING_WORK, PER_PAGE, STATUSES_FOR_PAID } from '../shared/constants.js';
import { requireAdmin } from './auth.js';
import * as delivery from './delivery.js';
import * as orders from './orders.js';
import * as razorpay from './razorpay.js';
import { DEFAULT_SETTINGS, SETTING_KEYS, getSettings, saveSettings } from './settings.js';
import { IST_OFFSET_MS, fail, fromIstParts, int, now, num, optStr, randomToken, round2, slugify, str, toIst } from './util.js';

export const adminRoutes = new Hono();

adminRoutes.use('*', async (c, next) => { requireAdmin(c); await next(); });

const body = async (c) => { try { return await c.req.json(); } catch { return {}; } };
const ok = (c, message, extra = {}) => c.json({ message, ...extra });

// ---------- Image storage (Cloudflare R2) ----------

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function storeImage(c, file, folder) {
  if (!c.env.IMAGES) fail(500, 'Image storage (R2 bucket "IMAGES") is not connected.');
  if (!file || typeof file === 'string') return null;
  const ext = IMAGE_TYPES[file.type];
  if (!ext) fail(422, 'Please upload JPG, PNG or WEBP images.');
  if (file.size > 5 * 1024 * 1024) fail(422, 'Each image must be smaller than 5 MB.');
  const key = `${folder}/${randomToken(10)}.${ext}`;
  await c.env.IMAGES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' } });
  return key;
}

async function deleteImages(c, ...keys) {
  const list = keys.filter(Boolean);
  if (list.length && c.env.IMAGES) await c.env.IMAGES.delete(list);
}

// ---------- Dashboard ----------

/** Sales = paid orders that were not cancelled. */
const SALE = "payment_status='paid' AND order_status!='cancelled'";

function istStartOf(unit, d = new Date()) {
  const ist = toIst(d);
  const y = ist.getUTCFullYear(); const m = ist.getUTCMonth(); const day = ist.getUTCDate();
  if (unit === 'day') return fromIstParts(y, m, day);
  if (unit === 'week') { const dow = (ist.getUTCDay() + 6) % 7; return fromIstParts(y, m, day - dow); } // Monday
  if (unit === 'month') return fromIstParts(y, m, 1);
  return fromIstParts(y, 0, 1);
}

adminRoutes.get('/dashboard', async (c) => {
  const db = c.env.DB;
  await orders.cancelStaleOrders(c.env);
  const s = await getSettings(c);
  const low = Math.max(0, int(s.low_stock_threshold, 5));
  const sumSince = (from) => db.prepare(`SELECT COALESCE(SUM(total_amount),0) AS v, COUNT(*) AS n FROM orders WHERE ${SALE} AND created_at >= ?`).bind(from.toISOString()).first();

  const [today, week, month, year, counts, stock, recent, lowStock] = await Promise.all([
    sumSince(istStartOf('day')), sumSince(istStartOf('week')), sumSince(istStartOf('month')), sumSince(istStartOf('year')),
    db.prepare(`SELECT
        (SELECT COUNT(*) FROM orders WHERE order_status IN (${PENDING_WORK.map(() => '?').join(',')})) AS pending,
        (SELECT COUNT(*) FROM orders WHERE order_status='delivered') AS delivered,
        (SELECT COUNT(*) FROM orders WHERE order_status='cancelled') AS cancelled,
        (SELECT COUNT(*) FROM users WHERE role='CUSTOMER') AS customers,
        (SELECT COUNT(*) FROM products) AS products`).bind(...PENDING_WORK).first(),
    db.prepare('SELECT SUM(CASE WHEN stock_quantity=0 THEN 1 ELSE 0 END) AS out_of_stock, SUM(CASE WHEN stock_quantity>0 AND stock_quantity<=? THEN 1 ELSE 0 END) AS low_stock FROM products WHERE status=\'active\'').bind(low).first(),
    db.prepare("SELECT id, order_number, shipping_name, total_amount, payment_status, order_status, created_at FROM orders WHERE order_status!='payment_pending' ORDER BY id DESC LIMIT 8").all(),
    db.prepare("SELECT id, name, stock_quantity FROM products WHERE status='active' AND stock_quantity<=? ORDER BY stock_quantity, name LIMIT 8").bind(low).all(),
  ]);

  // Chart: last 30 days, by IST day.
  const from = new Date(istStartOf('day').getTime() - 29 * 86400000);
  const { results: rows } = await db.prepare(`SELECT created_at, total_amount FROM orders WHERE ${SALE} AND created_at >= ?`).bind(from.toISOString()).all();
  const byDay = {};
  for (const r of rows) { const k = toIst(r.created_at).toISOString().slice(0, 10); byDay[k] = (byDay[k] || 0) + Number(r.total_amount); }
  const chart = [];
  for (let i = 0; i < 30; i++) {
    const d = toIst(new Date(from.getTime() + i * 86400000));
    const k = d.toISOString().slice(0, 10);
    chart.push({ label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' }), value: round2(byDay[k] || 0) });
  }

  return c.json({
    sales: { today: today.v, week: week.v, month: month.v, year: year.v, todayOrders: today.n, monthOrders: month.n },
    counts, stock: { out: stock.out_of_stock || 0, low: stock.low_stock || 0, threshold: low },
    recent: recent.results, lowStock: lowStock.results, chart,
  });
});

// ---------- Categories ----------

async function uniqueSlug(db, table, name, ignoreId = 0) {
  const base = slugify(name) || 'item';
  let slug = base; let i = 2;
  while (await db.prepare(`SELECT 1 FROM ${table} WHERE slug=? AND id!=?`).bind(slug, ignoreId).first()) slug = `${base}-${i++}`;
  return slug;
}

adminRoutes.get('/categories', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id) AS product_count FROM categories c ORDER BY display_order, name').all();
  return c.json({ categories: results });
});

adminRoutes.post('/categories', async (c) => {
  const f = await c.req.parseBody();
  const name = str(f.name, 100);
  if (name.length < 2) fail(422, 'Please enter a category name.', { name: 'Required.' });
  const t = now();
  const row = await c.env.DB.prepare('INSERT INTO categories (name, slug, display_order, status, created_at, updated_at) VALUES (?,?,?,?,?,?) RETURNING id')
    .bind(name, await uniqueSlug(c.env.DB, 'categories', name), int(f.display_order, 0), f.status === 'inactive' ? 'inactive' : 'active', t, t).first();
  const key = await storeImage(c, f.image, `categories/${row.id}`);
  if (key) await c.env.DB.prepare('UPDATE categories SET image_key=? WHERE id=?').bind(key, row.id).run();
  return ok(c, 'Category added.');
});

adminRoutes.put('/categories/:id', async (c) => {
  const cat = await c.env.DB.prepare('SELECT * FROM categories WHERE id=?').bind(int(c.req.param('id'))).first();
  if (!cat) fail(404, 'Category not found.');
  const f = await c.req.parseBody();
  const name = str(f.name, 100);
  if (name.length < 2) fail(422, 'Please enter a category name.', { name: 'Required.' });
  let imageKey = cat.image_key;
  const newKey = await storeImage(c, f.image, `categories/${cat.id}`);
  if (newKey || f.remove_image === '1') { await deleteImages(c, cat.image_key); imageKey = newKey; }
  const slug = name === cat.name ? cat.slug : await uniqueSlug(c.env.DB, 'categories', name, cat.id);
  await c.env.DB.prepare('UPDATE categories SET name=?, slug=?, display_order=?, status=?, image_key=?, updated_at=? WHERE id=?')
    .bind(name, slug, int(f.display_order, 0), f.status === 'inactive' ? 'inactive' : 'active', imageKey, now(), cat.id).run();
  return ok(c, 'Category updated.');
});

adminRoutes.delete('/categories/:id', async (c) => {
  const cat = await c.env.DB.prepare('SELECT * FROM categories WHERE id=?').bind(int(c.req.param('id'))).first();
  if (!cat) fail(404, 'Category not found.');
  if (await c.env.DB.prepare('SELECT 1 FROM products WHERE category_id=?').bind(cat.id).first()) fail(422, 'This category has products. Move or delete them first, or set the category to Inactive.');
  await c.env.DB.prepare('DELETE FROM categories WHERE id=?').bind(cat.id).run();
  await deleteImages(c, cat.image_key);
  return ok(c, 'Category deleted.');
});

// ---------- Products ----------

adminRoutes.get('/products', async (c) => {
  const q = c.req.query();
  const where = ['1=1']; const binds = [];
  if (q.q) { where.push('p.name LIKE ?'); binds.push(`%${q.q}%`); }
  if (q.category) { where.push('p.category_id = ?'); binds.push(int(q.category)); }
  if (q.status) { where.push('p.status = ?'); binds.push(q.status); }
  const page = Math.max(1, int(q.page, 1));
  const w = where.join(' AND ');
  const total = (await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM products p WHERE ${w}`).bind(...binds).first()).n;
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.slug, p.price, p.original_price, p.stock_quantity, p.status, c.name AS category_name,
       (SELECT COALESCE(thumb_key, image_key) FROM product_images i WHERE i.product_id=p.id ORDER BY display_order, id LIMIT 1) AS thumb_key
     FROM products p JOIN categories c ON c.id=p.category_id WHERE ${w} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
  ).bind(...binds, 20, (page - 1) * 20).all();
  return c.json({ products: results, page, lastPage: Math.max(1, Math.ceil(total / 20)), total });
});

adminRoutes.get('/products/:id', async (c) => {
  const p = await c.env.DB.prepare('SELECT * FROM products WHERE id=?').bind(int(c.req.param('id'))).first();
  if (!p) fail(404, 'Product not found.');
  const { results: images } = await c.env.DB.prepare('SELECT * FROM product_images WHERE product_id=? ORDER BY display_order, id').bind(p.id).all();
  return c.json({ product: { ...p, images } });
});

async function validateProduct(c, b) {
  const p = {
    name: str(b.name, 190), category_id: int(b.category_id), description: optStr(b.description, 5000), meta_description: optStr(b.meta_description, 300),
    price: num(b.price), original_price: num(b.original_price), stock_quantity: int(b.stock_quantity, -1),
    material: optStr(b.material, 100), colour: optStr(b.colour, 100), size: optStr(b.size, 100), weight: optStr(b.weight, 100),
    status: b.status === 'inactive' ? 'inactive' : 'active',
  };
  const f = {};
  if (p.name.length < 2) f.name = 'Please enter the product name.';
  if (!(await c.env.DB.prepare('SELECT 1 FROM categories WHERE id=?').bind(p.category_id).first())) f.category_id = 'Please choose a category.';
  if (p.price === null || p.price <= 0 || p.price > 10000000) f.price = 'Please enter a valid selling price.';
  if (p.original_price !== null && p.price !== null && p.original_price < p.price) f.original_price = 'MRP must be equal to or more than the selling price.';
  if (p.stock_quantity < 0 || p.stock_quantity > 100000) f.stock_quantity = 'Please enter the stock quantity (0 or more).';
  if (Object.keys(f).length) fail(422, 'Please check the form.', f);
  p.price = round2(p.price);
  if (p.original_price !== null) p.original_price = round2(p.original_price);
  if (!p.meta_description && p.description) p.meta_description = p.description.replace(/\s+/g, ' ').slice(0, 155);
  return p;
}

adminRoutes.post('/products', async (c) => {
  const p = await validateProduct(c, await body(c));
  const t = now();
  const row = await c.env.DB.prepare(`INSERT INTO products (category_id, name, slug, description, meta_description, price, original_price, stock_quantity, material, colour, size, weight, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`)
    .bind(p.category_id, p.name, await uniqueSlug(c.env.DB, 'products', p.name), p.description, p.meta_description, p.price, p.original_price, p.stock_quantity,
      p.material, p.colour, p.size, p.weight, p.status, t, t).first();
  return ok(c, 'Product saved. Now add photos.', { id: row.id });
});

adminRoutes.put('/products/:id', async (c) => {
  const existing = await c.env.DB.prepare('SELECT id, name, slug FROM products WHERE id=?').bind(int(c.req.param('id'))).first();
  if (!existing) fail(404, 'Product not found.');
  const p = await validateProduct(c, await body(c));
  const slug = p.name === existing.name ? existing.slug : await uniqueSlug(c.env.DB, 'products', p.name, existing.id);
  await c.env.DB.prepare(`UPDATE products SET category_id=?, name=?, slug=?, description=?, meta_description=?, price=?, original_price=?, stock_quantity=?,
      material=?, colour=?, size=?, weight=?, status=?, updated_at=? WHERE id=?`)
    .bind(p.category_id, p.name, slug, p.description, p.meta_description, p.price, p.original_price, p.stock_quantity, p.material, p.colour, p.size, p.weight, p.status, now(), existing.id).run();
  return ok(c, 'Product updated.');
});

adminRoutes.patch('/products/:id/status', async (c) => {
  await c.env.DB.prepare("UPDATE products SET status = CASE status WHEN 'active' THEN 'inactive' ELSE 'active' END, updated_at=? WHERE id=?").bind(now(), int(c.req.param('id'))).run();
  return ok(c, 'Status changed.');
});

// Products already sold are only deactivated, so old orders stay intact.
adminRoutes.delete('/products/:id', async (c) => {
  const id = int(c.req.param('id'));
  if (await c.env.DB.prepare('SELECT 1 FROM order_items WHERE product_id=?').bind(id).first()) {
    await c.env.DB.prepare("UPDATE products SET status='inactive', updated_at=? WHERE id=?").bind(now(), id).run();
    return ok(c, 'This product appears in past orders, so it was deactivated instead of deleted.');
  }
  const { results: imgs } = await c.env.DB.prepare('SELECT image_key, thumb_key FROM product_images WHERE product_id=?').bind(id).all();
  await c.env.DB.prepare('DELETE FROM products WHERE id=?').bind(id).run();
  await deleteImages(c, ...imgs.flatMap((i) => [i.image_key, i.thumb_key]));
  return ok(c, 'Product deleted.');
});

// Photos are resized in the admin's browser (1200px + 400px thumbnail), then uploaded here.
adminRoutes.post('/products/:id/images', async (c) => {
  const id = int(c.req.param('id'));
  if (!(await c.env.DB.prepare('SELECT 1 FROM products WHERE id=?').bind(id).first())) fail(404, 'Product not found.');
  const count = (await c.env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(display_order),-1) AS mx FROM product_images WHERE product_id=?').bind(id).first());
  if (count.n >= 10) fail(422, 'A product can have up to 10 photos.');
  const f = await c.req.parseBody();
  const imageKey = await storeImage(c, f.image, `products/${id}`);
  if (!imageKey) fail(422, 'Please choose a photo.');
  const thumbKey = await storeImage(c, f.thumb, `products/${id}`);
  await c.env.DB.prepare('INSERT INTO product_images (product_id, image_key, thumb_key, display_order, created_at) VALUES (?,?,?,?,?)').bind(id, imageKey, thumbKey, count.mx + 1, now()).run();
  return ok(c, 'Photo added.');
});

adminRoutes.post('/products/:id/images/order', async (c) => {
  const id = int(c.req.param('id'));
  const { ids } = await body(c);
  const stmt = c.env.DB.prepare('UPDATE product_images SET display_order=? WHERE id=? AND product_id=?');
  if (Array.isArray(ids) && ids.length) await c.env.DB.batch(ids.slice(0, 20).map((imgId, i) => stmt.bind(i, int(imgId), id)));
  return ok(c, 'Photo order saved.');
});

adminRoutes.post('/images/:id/main', async (c) => {
  const img = await c.env.DB.prepare('SELECT * FROM product_images WHERE id=?').bind(int(c.req.param('id'))).first();
  if (!img) fail(404, 'Photo not found.');
  await c.env.DB.prepare('UPDATE product_images SET display_order = (SELECT MIN(display_order) FROM product_images WHERE product_id=?) - 1 WHERE id=?').bind(img.product_id, img.id).run();
  return ok(c, 'Main photo changed.');
});

adminRoutes.delete('/images/:id', async (c) => {
  const img = await c.env.DB.prepare('SELECT * FROM product_images WHERE id=?').bind(int(c.req.param('id'))).first();
  if (!img) fail(404, 'Photo not found.');
  await c.env.DB.prepare('DELETE FROM product_images WHERE id=?').bind(img.id).run();
  await deleteImages(c, img.image_key, img.thumb_key);
  return ok(c, 'Photo deleted.');
});

// ---------- Inventory ----------

adminRoutes.get('/inventory', async (c) => {
  const q = c.req.query();
  const s = await getSettings(c);
  const low = Math.max(0, int(s.low_stock_threshold, 5));
  const where = ['1=1']; const binds = [];
  if (q.filter === 'low') { where.push('p.stock_quantity > 0 AND p.stock_quantity <= ?'); binds.push(low); }
  if (q.filter === 'out') where.push('p.stock_quantity = 0');
  if (q.q) { where.push('p.name LIKE ?'); binds.push(`%${q.q}%`); }
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.stock_quantity, p.status, p.price, c.name AS category_name FROM products p JOIN categories c ON c.id=p.category_id
     WHERE ${where.join(' AND ')} ORDER BY p.stock_quantity ASC, p.name LIMIT 500`,
  ).bind(...binds).all();
  return c.json({ products: results, threshold: low });
});

adminRoutes.patch('/inventory/:id', async (c) => {
  const { stock_quantity } = await body(c);
  const qty = int(stock_quantity, -1);
  if (qty < 0 || qty > 100000) fail(422, 'Please enter a stock quantity of 0 or more.');
  await c.env.DB.prepare('UPDATE products SET stock_quantity=?, updated_at=? WHERE id=?').bind(qty, now(), int(c.req.param('id'))).run();
  return ok(c, 'Stock updated.');
});

// ---------- Orders ----------

adminRoutes.get('/orders', async (c) => {
  await orders.cancelStaleOrders(c.env);
  const q = c.req.query();
  const where = ['1=1']; const binds = [];
  if (q.status && ORDER_STATUS[q.status]) { where.push('o.order_status=?'); binds.push(q.status); }
  else if (q.status === 'pending_work') { where.push(`o.order_status IN (${PENDING_WORK.map(() => '?').join(',')})`); binds.push(...PENDING_WORK); }
  else if (!q.status) where.push("o.order_status!='payment_pending'");
  if (q.payment && PAYMENT_STATUS[q.payment]) { where.push('o.payment_status=?'); binds.push(q.payment); }
  if (q.q) { where.push('(o.order_number LIKE ? OR o.shipping_name LIKE ? OR o.shipping_mobile LIKE ? OR u.email LIKE ?)'); const l = `%${q.q}%`; binds.push(l, l, l, l); }
  const page = Math.max(1, int(q.page, 1));
  const w = where.join(' AND ');
  const total = (await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM orders o JOIN users u ON u.id=o.user_id WHERE ${w}`).bind(...binds).first()).n;
  const { results } = await c.env.DB.prepare(
    `SELECT o.id, o.order_number, o.shipping_name, o.shipping_mobile, o.total_amount, o.payment_status, o.order_status, o.delivery_status, o.created_at, u.email
     FROM orders o JOIN users u ON u.id=o.user_id WHERE ${w} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
  ).bind(...binds, 25, (page - 1) * 25).all();
  return c.json({ orders: results, page, lastPage: Math.max(1, Math.ceil(total / 25)), total });
});

async function loadOrder(c) {
  const order = await orders.getOrder(c.env, int(c.req.param('id')));
  if (!order) fail(404, 'Order not found.');
  return order;
}

adminRoutes.get('/orders/:id', async (c) => {
  const order = await loadOrder(c);
  const db = c.env.DB;
  const [items, payments, user] = await Promise.all([
    db.prepare(`SELECT oi.*, (SELECT COALESCE(thumb_key, image_key) FROM product_images i WHERE i.product_id=oi.product_id ORDER BY display_order, id LIMIT 1) AS thumb_key,
      (SELECT 1 FROM products p WHERE p.id=oi.product_id) AS product_exists FROM order_items oi WHERE oi.order_id=? ORDER BY oi.id`).bind(order.id).all(),
    db.prepare('SELECT id, transaction_id, gateway_payment_id, method, amount, status, paid_at, created_at FROM payments WHERE order_id=? ORDER BY id DESC').bind(order.id).all(),
    db.prepare('SELECT id, name, email, mobile FROM users WHERE id=?').bind(order.user_id).first(),
  ]);
  return c.json({
    order, items: items.results, payments: payments.results, user,
    statuses: order.payment_status === 'paid' ? STATUSES_FOR_PAID : ['payment_pending', 'cancelled'],
    borzoConnected: delivery.borzoConfigured(c.env), canBook: delivery.canBook(order), riderBooked: delivery.hasRiderBooked(order),
  });
});

adminRoutes.patch('/orders/:id/status', async (c) => {
  const order = await loadOrder(c);
  const { order_status } = await body(c);
  if (!ORDER_STATUS[order_status]) fail(422, 'Unknown status.');
  await orders.updateStatus(c, order, order_status);
  return ok(c, `Order status changed to ${ORDER_STATUS[order_status].label}.`);
});

adminRoutes.post('/orders/:id/refunded', async (c) => {
  await orders.markRefunded(c, await loadOrder(c));
  return ok(c, 'Order marked as refunded.');
});

adminRoutes.post('/orders/:id/recheck', async (c) => {
  const order = await loadOrder(c);
  const { results } = await c.env.DB.prepare("SELECT transaction_id FROM payments WHERE order_id=? AND status!='success' ORDER BY id DESC LIMIT 5").bind(order.id).all();
  if (!results.length) fail(422, 'No payment attempts to check.');
  for (const p of results) await orders.applyPaymentResult(c, await razorpay.fetchStatus(c.env, p.transaction_id));
  const fresh = await orders.getOrder(c.env, order.id);
  return ok(c, fresh.payment_status === 'paid' ? 'Payment confirmed by Razorpay. The order is now paid.' : `Razorpay says the payment is not complete (${PAYMENT_STATUS[fresh.payment_status].label}).`);
});

adminRoutes.patch('/orders/:id/note', async (c) => {
  const order = await loadOrder(c);
  const { admin_note } = await body(c);
  await c.env.DB.prepare('UPDATE orders SET admin_note=?, updated_at=? WHERE id=?').bind(optStr(admin_note, 5000), now(), order.id).run();
  return ok(c, 'Note saved.');
});

adminRoutes.post('/orders/:id/rider/book', async (c) => {
  const order = await loadOrder(c);
  try { await delivery.book(c.env, await getSettings(c), order); } catch (e) { fail(422, e.message); }
  return ok(c, 'Borzo rider booked. The rider will come to the shop for pickup.');
});

adminRoutes.post('/orders/:id/rider/refresh', async (c) => {
  const order = await loadOrder(c);
  if (!order.delivery_order_id || order.delivery_provider !== 'borzo') fail(422, 'No Borzo booking on this order.');
  let bo;
  try { bo = await delivery.fetchBorzoOrder(c.env, order.delivery_order_id); } catch (e) { fail(422, e.message); }
  if (bo) {
    const { order: updated, target } = await delivery.applyBorzoOrder(c.env, bo);
    if (updated && target) await orders.updateStatus(c, updated, target);
  }
  return ok(c, 'Delivery status refreshed.');
});

adminRoutes.post('/orders/:id/rider/cancel', async (c) => {
  const order = await loadOrder(c);
  try { await delivery.cancelRider(c.env, order); } catch (e) { fail(422, e.message); }
  return ok(c, 'Borzo rider cancelled.');
});

adminRoutes.patch('/orders/:id/rider/manual', async (c) => {
  const order = await loadOrder(c);
  const b = await body(c);
  const url = optStr(b.delivery_tracking_url, 500);
  if (url && !/^https:\/\//i.test(url)) fail(422, 'The tracking link must start with https://', { delivery_tracking_url: 'Must start with https://' });
  const provider = ['borzo', 'rapido', 'other'].includes(b.delivery_provider) ? b.delivery_provider : 'other';
  await c.env.DB.prepare(`UPDATE orders SET delivery_provider=?, delivery_tracking_url=?, delivery_courier_name=?, delivery_courier_phone=?,
      delivery_status=COALESCE(delivery_status, 'manual'), updated_at=? WHERE id=?`)
    .bind(provider, url, optStr(b.delivery_courier_name, 100), optStr(b.delivery_courier_phone, 20), now(), order.id).run();
  return ok(c, 'Delivery details saved.');
});

// ---------- Customers ----------

adminRoutes.get('/customers', async (c) => {
  const q = c.req.query();
  const page = Math.max(1, int(q.page, 1));
  const where = ["u.role='CUSTOMER'"]; const binds = [];
  if (q.q) { where.push('(u.name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ?)'); const l = `%${q.q}%`; binds.push(l, l, l); }
  const w = where.join(' AND ');
  const total = (await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users u WHERE ${w}`).bind(...binds).first()).n;
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.mobile, u.created_at,
       (SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id AND o.${SALE.replace(/ AND /, ' AND o.')}) AS orders_count,
       (SELECT COALESCE(SUM(total_amount),0) FROM orders o WHERE o.user_id=u.id AND o.${SALE.replace(/ AND /, ' AND o.')}) AS total_spent
     FROM users u WHERE ${w} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
  ).bind(...binds, 25, (page - 1) * 25).all();
  return c.json({ customers: results, page, lastPage: Math.max(1, Math.ceil(total / 25)), total });
});

// ---------- Sales ----------

function salesRange(q) {
  const end = new Date();
  if (q.period === 'today') return [istStartOf('day'), end, 'Today'];
  if (q.period === 'week') return [istStartOf('week'), end, 'This week'];
  if (q.period === 'year') return [istStartOf('year'), end, 'This year'];
  if (q.period === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') && /^\d{4}-\d{2}-\d{2}$/.test(q.to || '')) {
    let [a, b] = [q.from, q.to].sort();
    const [y1, m1, d1] = a.split('-').map(Number); const [y2, m2, d2] = b.split('-').map(Number);
    return [fromIstParts(y1, m1 - 1, d1), new Date(fromIstParts(y2, m2 - 1, d2 + 1).getTime() - 1), `${a} – ${b}`];
  }
  return [istStartOf('month'), end, 'This month'];
}

adminRoutes.get('/sales', async (c) => {
  const [from, to, label] = salesRange(c.req.query());
  const db = c.env.DB;
  const f = from.toISOString(); const t = to.toISOString();
  const summary = await db.prepare(`SELECT
      (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE ${SALE} AND created_at BETWEEN ?1 AND ?2) AS total_sales,
      (SELECT COUNT(*) FROM orders WHERE order_status!='payment_pending' AND created_at BETWEEN ?1 AND ?2) AS total_orders,
      (SELECT COUNT(*) FROM orders WHERE payment_status='paid' AND created_at BETWEEN ?1 AND ?2) AS paid_orders,
      (SELECT COUNT(*) FROM orders WHERE order_status='cancelled' AND created_at BETWEEN ?1 AND ?2) AS cancelled_orders,
      (SELECT COUNT(*) FROM orders WHERE order_status='payment_pending' AND created_at BETWEEN ?1 AND ?2) AS unpaid_orders`).bind(f, t).first();
  const { results: top } = await db.prepare(
    `SELECT oi.product_id, oi.product_name, SUM(oi.quantity) AS qty, SUM(oi.total) AS revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id
     WHERE o.payment_status='paid' AND o.order_status!='cancelled' AND o.created_at BETWEEN ? AND ? GROUP BY oi.product_id, oi.product_name ORDER BY qty DESC LIMIT 10`,
  ).bind(f, t).all();

  // Chart: by day (or month for long ranges), IST.
  const { results: rows } = await db.prepare(`SELECT created_at, total_amount FROM orders WHERE ${SALE} AND created_at BETWEEN ? AND ?`).bind(f, t).all();
  const byMonth = (to - from) / 86400000 > 93;
  const keyOf = (d) => toIst(d).toISOString().slice(0, byMonth ? 7 : 10);
  const sums = {};
  for (const r of rows) sums[keyOf(r.created_at)] = (sums[keyOf(r.created_at)] || 0) + Number(r.total_amount);
  const chart = [];
  let cursor = toIst(from);
  const endKey = keyOf(to);
  for (let guard = 0; guard < 400; guard++) {
    const k = cursor.toISOString().slice(0, byMonth ? 7 : 10);
    chart.push({ label: cursor.toLocaleDateString('en-IN', byMonth ? { month: 'short', year: 'numeric', timeZone: 'UTC' } : { day: '2-digit', month: 'short', timeZone: 'UTC' }), value: round2(sums[k] || 0) });
    if (k >= endKey) break;
    cursor = byMonth ? new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)) : new Date(cursor.getTime() + 86400000);
  }

  // Last 12 months table.
  const nowIst = toIst(new Date());
  const start12 = fromIstParts(nowIst.getUTCFullYear(), nowIst.getUTCMonth() - 11, 1);
  const { results: m } = await db.prepare(`SELECT created_at, total_amount FROM orders WHERE ${SALE} AND created_at >= ?`).bind(start12.toISOString()).all();
  const monthly = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth() - i, 1));
    const k = d.toISOString().slice(0, 7);
    const rowsK = m.filter((r) => toIst(r.created_at).toISOString().slice(0, 7) === k);
    monthly.unshift({ month: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }), orders: rowsK.length, amount: round2(rowsK.reduce((s, r) => s + Number(r.total_amount), 0)) });
  } // newest month first

  return c.json({ label, from: f, to: t, summary, top, chart, monthly });
});

const csvSafe = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`; // stops spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

adminRoutes.get('/sales/export', async (c) => {
  const [from, to] = salesRange(c.req.query());
  const { results } = await c.env.DB.prepare(
    `SELECT o.*, u.email, (SELECT GROUP_CONCAT(product_name || ' x' || quantity, '; ') FROM order_items WHERE order_id=o.id) AS items
     FROM orders o LEFT JOIN users u ON u.id=o.user_id WHERE o.created_at BETWEEN ? AND ? ORDER BY o.id`,
  ).bind(from.toISOString(), to.toISOString()).all();
  const head = ['Order Number', 'Date', 'Customer', 'Mobile', 'Email', 'City', 'Items', 'Subtotal (MRP)', 'Discount', 'Delivery Charge', 'Total', 'Payment Status', 'Order Status'];
  const lines = [head.join(',')];
  for (const o of results) {
    const date = new Date(new Date(o.created_at).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
    lines.push([o.order_number, date, o.shipping_name, o.shipping_mobile, o.email, o.shipping_city, o.items, o.subtotal, o.discount, o.delivery_charge, o.total_amount,
      PAYMENT_STATUS[o.payment_status]?.label, ORDER_STATUS[o.order_status]?.label].map(csvSafe).join(','));
  }
  const name = `orders-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv`;
  return new Response('﻿' + lines.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=UTF-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  });
});

// ---------- Settings ----------

adminRoutes.get('/settings', async (c) => c.json({
  settings: await getSettings(c),
  connections: {
    razorpay: razorpay.razorpayConfigured(c.env), razorpayMode: razorpay.razorpayMode(c.env), razorpayWebhook: Boolean(c.env.RAZORPAY_WEBHOOK_SECRET),
    borzo: delivery.borzoConfigured(c.env), borzoMode: c.env.BORZO_MODE === 'live' ? 'live' : 'test',
    email: Boolean(c.env.RESEND_API_KEY), images: Boolean(c.env.IMAGES),
  },
}));

adminRoutes.put('/settings', async (c) => {
  const f = await c.req.parseBody();
  const current = await getSettings(c);
  const values = {};
  for (const key of SETTING_KEYS) {
    if (key === 'logo_key' || key === 'hero_image_key') continue;
    if (f[key] !== undefined && typeof f[key] === 'string') values[key] = f[key].slice(0, 10000).trim();
  }
  if (!values.shop_name) fail(422, 'Shop name is required.', { shop_name: 'Required.' });
  values.delivery_pricing = values.delivery_pricing === 'live' ? 'live' : 'flat';
  values.delivery_auto_book = values.delivery_auto_book === '1' ? '1' : '0';
  for (const k of ['delivery_flat_charge', 'free_delivery_above', 'low_stock_threshold']) values[k] = String(Math.max(0, Number(values[k]) || 0));
  for (const k of ['instagram_url', 'facebook_url', 'youtube_url']) if (values[k] && !/^https:\/\//i.test(values[k])) fail(422, 'Social links must start with https://', { [k]: 'Must start with https://' });
  if (!values.delivery_pincodes) values.delivery_pincodes = DEFAULT_SETTINGS.delivery_pincodes;

  for (const [field, key] of [['logo', 'logo_key'], ['hero_image', 'hero_image_key']]) {
    const newKey = await storeImage(c, f[field], 'site');
    if (newKey || f[`remove_${field}`] === '1') {
      await deleteImages(c, current[key]);
      values[key] = newKey || '';
    }
  }
  await saveSettings(c, values);
  return ok(c, 'Settings saved.');
});
