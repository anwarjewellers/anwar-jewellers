// Cart pricing, orders, payments and order status changes.
import { CANCEL_UNPAID_AFTER_HOURS, MAX_PER_ITEM } from '../shared/constants.js';
import * as delivery from './delivery.js';
import { newOrderAdminEmail, orderPaidEmail, sendMail, statusEmail } from './mail.js';
import * as razorpay from './razorpay.js';
import { getSettings } from './settings.js';
import { fail, now, round2, toPaise } from './util.js';

const mrpOf = (p) => (p.original_price && Number(p.original_price) > Number(p.price) ? Number(p.original_price) : Number(p.price));

/**
 * Prices a cart sent by the browser ([{productId, quantity}]).
 * Prices ALWAYS come from the database, never from the browser.
 */
export async function priceCart(env, items) {
  const wanted = new Map();
  for (const it of Array.isArray(items) ? items.slice(0, 50) : []) {
    const id = parseInt(it?.productId, 10);
    const qty = parseInt(it?.quantity, 10);
    if (id > 0 && qty > 0) wanted.set(id, Math.min(qty, 999));
  }
  if (!wanted.size) return { lines: [], totals: { subtotal: 0, discount: 0, total: 0, count: 0 } };

  const ids = [...wanted.keys()];
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.slug, p.price, p.original_price, p.stock_quantity, p.status, c.status AS category_status,
       (SELECT COALESCE(thumb_key, image_key) FROM product_images i WHERE i.product_id = p.id ORDER BY display_order, id LIMIT 1) AS thumb_key
     FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id IN (${ids.map(() => '?').join(',')})`,
  ).bind(...ids).all();

  const lines = [];
  for (const p of results) {
    const quantity = wanted.get(p.id);
    let problem = null;
    if (p.status !== 'active' || p.category_status !== 'active') problem = 'This product is no longer available.';
    else if (p.stock_quantity <= 0) problem = 'Product is out of stock.';
    else if (quantity > p.stock_quantity) problem = `Only ${p.stock_quantity} left in stock.`;
    else if (quantity > MAX_PER_ITEM) problem = `You can buy at most ${MAX_PER_ITEM} of one product per order.`;
    const price = Number(p.price);
    const mrp = mrpOf(p);
    lines.push({
      product: { id: p.id, name: p.name, slug: p.slug, price, original_price: p.original_price, stock_quantity: p.stock_quantity, thumb_key: p.thumb_key },
      quantity, price, mrp,
      line_total: round2(price * quantity),
      line_mrp: round2(mrp * quantity),
      problem,
    });
  }
  lines.sort((a, b) => ids.indexOf(a.product.id) - ids.indexOf(b.product.id));
  const subtotal = round2(lines.reduce((s, l) => s + l.line_mrp, 0));
  const total = round2(lines.reduce((s, l) => s + l.line_total, 0));
  return { lines, totals: { subtotal, discount: round2(subtotal - total), total, count: lines.reduce((s, l) => s + l.quantity, 0) } };
}

/** Creates a "Payment Pending" order. */
export async function createOrder(c, user, address, items) {
  const env = c.env;
  const s = await getSettings(c);
  const { lines, totals } = await priceCart(env, items);
  if (!lines.length) fail(422, 'Your cart is empty.');
  const bad = lines.find((l) => l.problem);
  if (bad) fail(422, `${bad.product.name}: ${bad.problem}`);

  const deliveryCharge = await delivery.chargeFor(env, s, address, totals.total);
  const t = now();
  const order = await env.DB.prepare(
    `INSERT INTO orders (user_id, address_id, shipping_name, shipping_mobile, shipping_address, shipping_city, shipping_state, shipping_pincode,
       subtotal, discount, delivery_charge, total_amount, payment_status, order_status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending','payment_pending',?,?) RETURNING id`,
  ).bind(user.id, address.id, address.full_name, address.mobile, delivery.addressText(address), address.city, address.state, address.pincode,
    totals.subtotal, totals.discount, deliveryCharge, round2(totals.total + deliveryCharge), t, t).first();

  // e.g. ORD-20261005-10001 (IST date + running number)
  const ist = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10).replace(/-/g, '');
  const orderNumber = `ORD-${ist}-${10000 + order.id}`;
  const itemStmt = env.DB.prepare('INSERT INTO order_items (order_id, product_id, product_name, price, original_price, quantity, total) VALUES (?,?,?,?,?,?,?)');
  await env.DB.batch([
    env.DB.prepare('UPDATE orders SET order_number=? WHERE id=?').bind(orderNumber, order.id),
    ...lines.map((l) => itemStmt.bind(order.id, l.product.id, l.product.name, l.price, l.mrp > l.price ? l.mrp : null, l.quantity, l.line_total)),
  ]);
  return { id: order.id, order_number: orderNumber };
}

export const getOrder = (env, id) => env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
export const getItems = async (env, orderId) => (await env.DB.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').bind(orderId).all()).results;

export const canBePaid = (o) => o.order_status === 'payment_pending' && ['pending', 'failed'].includes(o.payment_status);

/** New payment attempt → options for the Razorpay checkout popup. */
export async function startPayment(c, order, user) {
  const env = c.env;
  if (!canBePaid(order)) fail(422, 'This order cannot be paid now.');
  const items = await getItems(env, order.id);
  for (const it of items) {
    const p = it.product_id ? await env.DB.prepare('SELECT status, stock_quantity FROM products WHERE id=?').bind(it.product_id).first() : null;
    if (!p || p.status !== 'active' || p.stock_quantity < it.quantity) fail(422, `Sorry, ${it.product_name} is out of stock now. Please place a new order.`);
  }
  const s = await getSettings(c);
  const { razorpayOrderId, checkout } = await razorpay.createCheckout(env, order, user, s.shop_name);
  const t = now();
  await env.DB.prepare("INSERT INTO payments (order_id, gateway, transaction_id, amount, status, created_at, updated_at) VALUES (?, 'razorpay', ?, ?, 'pending', ?, ?)")
    .bind(order.id, razorpayOrderId, order.total_amount, t, t).run();
  return checkout;
}

/**
 * Applies a VERIFIED payment result. Safe to call many times for the same transaction:
 * only the first successful call changes stock and status.
 */
export async function applyPaymentResult(c, result) {
  const env = c.env;
  const payment = await env.DB.prepare('SELECT * FROM payments WHERE transaction_id=?').bind(result.transactionId).first();
  if (!payment) { console.warn('Payment result for unknown transaction', result.transactionId); return null; }
  let order = await getOrder(env, payment.order_id);

  if (payment.status === 'success' || result.status === razorpay.PENDING) return order;

  const details = JSON.stringify(result.details || {});
  const t = now();

  if (result.status === razorpay.FAILED) {
    await env.DB.batch([
      env.DB.prepare("UPDATE payments SET status='failed', gateway_payment_id=?, method=?, response=?, updated_at=? WHERE id=? AND status='pending'")
        .bind(result.gatewayPaymentId ?? null, result.method ?? null, details, t, payment.id),
      env.DB.prepare("UPDATE orders SET payment_status='failed', updated_at=? WHERE id=? AND payment_status='pending' AND order_status='payment_pending'").bind(t, order.id),
    ]);
    return getOrder(env, order.id);
  }

  // ---- Success reported by the gateway ----
  if (toPaise(result.amount) !== toPaise(payment.amount)) {
    console.error('Payment amount mismatch', payment.transaction_id, payment.amount, result.amount);
    await env.DB.prepare("UPDATE payments SET status='failed', response=?, updated_at=? WHERE id=?").bind(details, t, payment.id).run();
    await delivery.addNote(env, order.id, `Payment ${payment.transaction_id} amount mismatch (received ₹${result.amount}). Check the Razorpay dashboard.`);
    return getOrder(env, order.id);
  }

  // Claim this payment exactly once (the WHERE makes duplicate callbacks no-ops).
  const claim = await env.DB.prepare("UPDATE payments SET status='success', gateway_payment_id=?, method=?, response=?, paid_at=?, updated_at=? WHERE id=? AND status!='success'")
    .bind(result.gatewayPaymentId ?? null, result.method ?? null, details, t, t, payment.id).run();
  if (claim.meta.changes !== 1) return getOrder(env, order.id);

  // Claim the order as paid exactly once.
  const paid = await env.DB.prepare("UPDATE orders SET payment_status='paid', updated_at=? WHERE id=? AND payment_status IN ('pending','failed')").bind(t, order.id).run();
  if (paid.meta.changes !== 1) {
    await delivery.addNote(env, order.id, `Extra payment received (${payment.transaction_id}, ₹${payment.amount}). Please refund it from the Razorpay dashboard.`);
    return getOrder(env, order.id);
  }

  order = await getOrder(env, order.id);
  const items = await getItems(env, order.id);
  if (order.order_status !== 'cancelled' && (await deductStock(env, items))) {
    await env.DB.prepare("UPDATE orders SET order_status='order_confirmed', stock_deducted=1, updated_at=? WHERE id=?").bind(t, order.id).run();
  } else {
    await env.DB.prepare("UPDATE orders SET order_status='payment_confirmed', updated_at=? WHERE id=?").bind(t, order.id).run();
    await delivery.addNote(env, order.id, 'Paid, but stock was not available (or the order had been cancelled). Contact the customer, then refund or arrange the item.');
  }
  order = await getOrder(env, order.id);
  c.executionCtx.waitUntil(afterPaid(c, order, items));
  return order;
}

/** Takes stock for every item, or none at all. Never goes below zero. */
async function deductStock(env, items) {
  const lines = items.filter((i) => i.product_id);
  if (lines.length !== items.length) return false;
  const stmt = env.DB.prepare('UPDATE products SET stock_quantity = stock_quantity - ?, updated_at=? WHERE id=? AND stock_quantity >= ?');
  const t = now();
  const res = await env.DB.batch(lines.map((i) => stmt.bind(i.quantity, t, i.product_id, i.quantity)));
  const failed = res.some((r) => r.meta.changes !== 1);
  if (!failed) return true;
  // Put back what was taken.
  const undo = env.DB.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id=?');
  const back = lines.filter((_, idx) => res[idx].meta.changes === 1).map((i) => undo.bind(i.quantity, i.product_id));
  if (back.length) await env.DB.batch(back);
  return false;
}

async function afterPaid(c, order, items) {
  const env = c.env;
  const s = await getSettings(c);
  const origin = new URL(c.req.url).origin;
  const user = await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(order.user_id).first();
  const mail = orderPaidEmail(s, origin, order, items);
  await sendMail(env, { to: user?.email, ...mail, replyTo: s.support_email || s.contact_email });
  if (s.contact_email) await sendMail(env, { to: s.contact_email, ...newOrderAdminEmail(s, origin, order, items) });

  // Instant delivery: book the Borzo rider straight away (if switched on in Settings).
  if (order.order_status === 'order_confirmed' && delivery.autoBookEnabled(env, s)) {
    await delivery.tryBook(env, s, order);
  }
}

/** Admin changes the order status. Emails the customer about the change. */
export async function updateStatus(c, order, status) {
  const env = c.env;
  if (order.order_status === status) return;
  if (status === 'payment_pending') fail(422, 'An order cannot be moved back to Payment Pending.');
  if (order.payment_status !== 'paid' && status !== 'cancelled') fail(422, 'This order is not paid yet. It can only be cancelled.');

  if (status === 'cancelled') {
    await cancelRiderQuietly(env, order);
    await cancelOrder(env, order);
  } else {
    await env.DB.prepare('UPDATE orders SET order_status=?, updated_at=? WHERE id=?').bind(status, now(), order.id).run();
  }

  if (['preparing', 'out_for_delivery', 'delivered', 'cancelled'].includes(status)) {
    const fresh = await getOrder(env, order.id);
    const user = await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(order.user_id).first();
    const s = await getSettings(c);
    c.executionCtx.waitUntil(sendMail(env, { to: user?.email, ...statusEmail(s, new URL(c.req.url).origin, fresh), replyTo: s.support_email || s.contact_email }));
  }
}

async function cancelRiderQuietly(env, order) {
  if (!delivery.hasRiderBooked(order)) return;
  try {
    await delivery.cancelRider(env, order);
  } catch (e) {
    await delivery.addNote(env, order.id, `Could not cancel the Borzo rider automatically (${e.message}). Cancel it in the Borzo app.`);
  }
}

/** Cancels the order and puts the stock back if it had been taken. */
export async function cancelOrder(env, order) {
  const t = now();
  const claim = await env.DB.prepare("UPDATE orders SET order_status='cancelled', stock_deducted=0, updated_at=? WHERE id=? AND order_status!='cancelled' RETURNING stock_deducted")
    .bind(t, order.id).first();
  if (claim && order.stock_deducted) {
    const items = await getItems(env, order.id);
    const stmt = env.DB.prepare('UPDATE products SET stock_quantity = stock_quantity + ?, updated_at=? WHERE id=?');
    const batch = items.filter((i) => i.product_id).map((i) => stmt.bind(i.quantity, t, i.product_id));
    if (batch.length) await env.DB.batch(batch);
  }
}

/** Owner refunded the money from the Razorpay dashboard and records it here. */
export async function markRefunded(c, order) {
  if (order.payment_status !== 'paid') fail(422, 'Only paid orders can be marked as refunded.');
  if (order.order_status !== 'cancelled') {
    await cancelRiderQuietly(c.env, order);
    await cancelOrder(c.env, order);
  }
  await c.env.DB.prepare("UPDATE orders SET payment_status='refunded', updated_at=? WHERE id=?").bind(now(), order.id).run();
  await delivery.addNote(c.env, order.id, `Marked as refunded on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`);
}

/** Unpaid orders older than 48 hours are cancelled (runs when the admin opens the panel). */
export async function cancelStaleOrders(env) {
  const cutoff = new Date(Date.now() - CANCEL_UNPAID_AFTER_HOURS * 3600000).toISOString();
  await env.DB.prepare("UPDATE orders SET order_status='cancelled', updated_at=? WHERE order_status='payment_pending' AND payment_status IN ('pending','failed') AND created_at < ?")
    .bind(now(), cutoff).run();
}
