// Razorpay Standard Checkout (UPI, cards, net banking, wallets).
// Docs: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/
//  1. Server creates a Razorpay order for the exact amount (in paise).
//  2. The customer pays in Razorpay's popup on our checkout page.
//  3. The browser sends razorpay_order_id / payment_id / signature back; we check
//     signature = HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET) AND fetch the
//     payment from Razorpay's API before marking the order paid.
//  4. The webhook (payment.captured / payment.failed) is a backup if the browser closes.
import { fail, hmacSha256Hex, safeEqual } from './util.js';

const API = 'https://api.razorpay.com/v1';

export const SUCCESS = 'success';
export const FAILED = 'failed';
export const PENDING = 'pending';

/** Payment fields we keep. Card numbers etc. are never sent to us anyway. */
const KEEP = ['id', 'order_id', 'status', 'method', 'amount', 'currency', 'bank', 'wallet', 'vpa', 'error_code', 'error_description', 'error_reason', 'created_at', 'captured'];

export const razorpayConfigured = (env) => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
export const razorpayMode = (env) => (String(env.RAZORPAY_KEY_ID || '').startsWith('rzp_live_') ? 'live' : 'test');

function ensure(env) {
  if (!razorpayConfigured(env)) fail(503, 'Online payment is not set up yet. Please contact the shop.');
}

async function rzp(env, method, path, body) {
  ensure(env);
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: 'Basic ' + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    console.warn('Razorpay unreachable', path, e.message);
    return { ok: false, unreachable: true };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.warn('Razorpay API error', path, res.status, JSON.stringify(data));
  return { ok: res.ok, status: res.status, data };
}

const sanitize = (p) => Object.fromEntries(Object.entries(p || {}).filter(([k]) => KEEP.includes(k)));
const rupees = (paise) => (Number(paise || 0) / 100).toFixed(2);

/** Creates a Razorpay order and returns the options for the checkout popup. */
export async function createCheckout(env, order, user, shopName) {
  ensure(env);
  const amount = Math.round(Number(order.total_amount) * 100);
  const r = await rzp(env, 'POST', '/orders', {
    amount,
    currency: 'INR',
    receipt: order.order_number,
    notes: { order_number: order.order_number, shop_order_id: String(order.id) },
  });
  if (!r.ok || !r.data?.id) fail(502, 'Could not start the payment. Please try again in a minute.');
  return {
    razorpayOrderId: r.data.id,
    checkout: {
      key: env.RAZORPAY_KEY_ID,
      order_id: r.data.id,
      amount,
      currency: 'INR',
      name: shopName,
      description: `Order ${order.order_number}`,
      prefill: { name: order.shipping_name, email: user.email, contact: order.shipping_mobile },
      notes: { order_number: order.order_number },
      theme: { color: '#c9a24a' },
    },
  };
}

/** Checks the signature the browser sends after a successful payment. */
export async function validCheckoutSignature(env, orderId, paymentId, signature) {
  if (!orderId || !paymentId || !signature) return false;
  return safeEqual(await hmacSha256Hex(env.RAZORPAY_KEY_SECRET || '', `${orderId}|${paymentId}`), String(signature).toLowerCase());
}

/** Checks the X-Razorpay-Signature header on webhooks. */
export async function validWebhookSignature(env, rawBody, signature) {
  const secret = env.RAZORPAY_WEBHOOK_SECRET || '';
  if (!secret || !signature) return false;
  return safeEqual(await hmacSha256Hex(secret, rawBody), String(signature).toLowerCase());
}

/** Turns one Razorpay payment into our result. Captures it if it is only authorised. */
async function resultFromPayment(env, razorpayOrderId, p) {
  let payment = p;
  if (payment.status === 'authorized') {
    const cap = await rzp(env, 'POST', `/payments/${payment.id}/capture`, { amount: payment.amount, currency: payment.currency || 'INR' });
    if (cap.ok) payment = cap.data;
  }
  const status = payment.status === 'captured' ? SUCCESS : payment.status === 'failed' ? FAILED : PENDING;
  return {
    transactionId: razorpayOrderId,
    status,
    amount: rupees(payment.amount),
    gatewayPaymentId: payment.id,
    method: payment.method || null,
    message: payment.error_description || null,
    details: sanitize(payment),
  };
}

/** Asks Razorpay directly for the latest state of one Razorpay order (server to server). */
export async function fetchStatus(env, razorpayOrderId) {
  const r = await rzp(env, 'GET', `/orders/${encodeURIComponent(razorpayOrderId)}/payments`);
  if (!r.ok) return { transactionId: razorpayOrderId, status: PENDING, message: 'Could not reach Razorpay.' };
  const payments = r.data?.items || [];
  if (!payments.length) return { transactionId: razorpayOrderId, status: PENDING, message: 'No payment yet.' };

  // A captured (or authorised) payment wins over earlier failed attempts in the same popup.
  const good = payments.find((p) => p.status === 'captured') || payments.find((p) => p.status === 'authorized');
  if (good) return resultFromPayment(env, razorpayOrderId, good);
  if (payments.every((p) => p.status === 'failed')) return resultFromPayment(env, razorpayOrderId, payments[0]);
  return { transactionId: razorpayOrderId, status: PENDING, message: 'Payment is still processing.' };
}

/** Result for a single payment id (used after the popup reports success). */
export async function fetchPayment(env, razorpayOrderId, paymentId) {
  const r = await rzp(env, 'GET', `/payments/${encodeURIComponent(paymentId)}`);
  if (!r.ok || r.data?.order_id !== razorpayOrderId) return fetchStatus(env, razorpayOrderId);
  return resultFromPayment(env, razorpayOrderId, r.data);
}
