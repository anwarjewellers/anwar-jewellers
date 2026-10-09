// Instant delivery inside Hyderabad through Borzo (Business API v1.6).
// Docs: https://borzodelivery.com/in/business-api/doc
import { fail, hmacSha256Hex, now, safeEqual, sha256Hex } from './util.js';

const URLS = {
  test: 'https://robotapitest-in.borzodelivery.com/api/business/1.6',
  live: 'https://robot-in.borzodelivery.com/api/business/1.6',
};

export class DeliveryError extends Error {}

export const borzoConfigured = (env) => Boolean(env.BORZO_API_TOKEN);
const vehicleType = (env) => parseInt(env.BORZO_VEHICLE_TYPE_ID || '8', 10); // 8 = motorbike

async function borzo(env, method, endpoint, payload) {
  if (!borzoConfigured(env)) throw new DeliveryError('Borzo is not connected yet (BORZO_API_TOKEN is empty).');
  let url = `${URLS[env.BORZO_MODE === 'live' ? 'live' : 'test']}/${endpoint}`;
  const init = { method, headers: { 'X-DV-Auth-Token': env.BORZO_API_TOKEN, Accept: 'application/json' } };
  if (method === 'GET') url += '?' + new URLSearchParams(payload);
  else { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(payload); }

  let data;
  try {
    const res = await fetch(url, init);
    data = await res.json();
  } catch (e) {
    console.warn('Borzo request failed', endpoint, e.message);
    throw new DeliveryError('Could not reach Borzo. Please try again in a minute.');
  }
  if (!data?.is_successful) {
    console.warn('Borzo API error', endpoint, JSON.stringify(data));
    const errors = [...(data?.errors || []), ...Object.keys(data?.parameter_errors || {})];
    throw new DeliveryError(`Borzo refused the request${errors.length ? ` (${errors.join(', ')})` : ''}.`);
  }
  return data;
}

export async function validCallbackSignature(env, rawBody, signature) {
  const secret = env.BORZO_CALLBACK_SECRET || '';
  if (!secret || !signature) return false;
  return safeEqual(await hmacSha256Hex(secret, rawBody), String(signature).toLowerCase());
}

// ---------- Delivery area & charge ----------

export const pincodePrefixes = (s) => String(s.delivery_pincodes || '500').split(',').map((p) => p.trim()).filter(Boolean);
export const deliversTo = (s, pincode) => pincodePrefixes(s).some((p) => String(pincode).trim().startsWith(p));

export function assertDeliverable(s, pincode) {
  if (!deliversTo(s, pincode)) {
    fail(422, `Sorry, we currently deliver only within ${s.delivery_area_name || 'Hyderabad'}. Pincode ${pincode} is outside our delivery area.`, { pincode: 'Outside our delivery area.' });
  }
}

const usesLivePricing = (env, s) => s.delivery_pricing === 'live' && borzoConfigured(env);
const freeAbove = (s) => Math.max(0, Number(s.free_delivery_above) || 0);
const flatCharge = (s) => Math.max(0, Number(s.delivery_flat_charge) || 0);

/** Charge shown before the address is known. null = "depends on the address" (live pricing). */
export function estimate(env, s, itemsTotal) {
  if (freeAbove(s) > 0 && itemsTotal >= freeAbove(s)) return 0;
  return usesLivePricing(env, s) ? null : flatCharge(s);
}

export const addressText = (a) => [a.house, a.street, a.area, a.city, a.state, a.pincode].filter(Boolean).join(', ');

/** Final delivery charge for this address (used when the order is created). */
export async function chargeFor(env, s, address, itemsTotal) {
  assertDeliverable(s, address.pincode);
  if (freeAbove(s) > 0 && itemsTotal >= freeAbove(s)) return 0;

  if (usesLivePricing(env, s)) {
    const text = addressText(address);
    const cache = caches.default;
    const cacheKey = new Request(`https://borzo-quote.internal/${await sha256Hex(text)}`);
    const hit = await cache.match(cacheKey);
    let price = hit ? Number(await hit.text()) : null;
    if (price === null) {
      try {
        const data = await borzo(env, 'POST', 'calculate-order', {
          matter: 'Jewellery', vehicle_type_id: vehicleType(env), total_weight_kg: 1,
          points: [{ address: s.shop_address || 'Hyderabad' }, { address: text }],
        });
        const amount = Number(data?.order?.payment_amount);
        if (Number.isFinite(amount)) {
          price = amount;
          await cache.put(cacheKey, new Response(String(price), { headers: { 'Cache-Control': 'max-age=900' } }));
        }
      } catch { /* fall back to the flat charge */ }
    }
    if (price !== null) return Math.ceil(price / 10) * 10; // round up to the next ₹10
    console.log('Borzo quote unavailable, using flat delivery charge.');
  }
  return flatCharge(s);
}

// ---------- Rider booking ----------

export const autoBookEnabled = (env, s) => s.delivery_auto_book === '1' && borzoConfigured(env);

export const hasRiderBooked = (o) => Boolean(o.delivery_order_id) && !['canceled', 'completed'].includes(o.delivery_status);

export function canBook(o) {
  return o.payment_status === 'paid'
    && !['cancelled', 'delivered'].includes(o.order_status)
    && (!o.delivery_order_id || o.delivery_status === 'canceled');
}

const phone10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const trackingUrl = (bo) => { const pts = bo?.points || []; return pts.length ? pts[pts.length - 1].tracking_url || null : null; };

export async function book(env, s, order) {
  if (!canBook(order)) throw new DeliveryError('A rider cannot be booked for this order (not paid, already booked, cancelled or delivered).');
  const payload = {
    matter: `Jewellery (order ${order.order_number})`,
    vehicle_type_id: vehicleType(env),
    total_weight_kg: 1,
    is_client_notification_enabled: true,
    is_contact_person_notification_enabled: true,
    points: [
      {
        address: s.shop_address || 'Hyderabad',
        contact_person: { name: s.pickup_contact_name || 'Shop', phone: phone10(s.pickup_phone) },
        client_order_id: order.order_number,
        note: `Pickup: ${order.order_number} – ${s.shop_name}`,
      },
      {
        address: [order.shipping_address, order.shipping_city, order.shipping_state, order.shipping_pincode].join(', '),
        contact_person: { name: order.shipping_name, phone: phone10(order.shipping_mobile) },
        client_order_id: order.order_number,
        note: `Prepaid order ${order.order_number}. Do not collect money.`,
      },
    ],
  };
  if (env.BORZO_INSURE_PARCEL !== '0') payload.insurance_amount = (Number(order.total_amount) - Number(order.delivery_charge)).toFixed(2);
  if (env.BORZO_PAYMENT_METHOD) payload.payment_method = env.BORZO_PAYMENT_METHOD;

  const data = await borzo(env, 'POST', 'create-order', payload);
  const bo = data.order;
  if (!bo?.order_id) throw new DeliveryError('Borzo did not return an order number.');

  await env.DB.prepare(`UPDATE orders SET delivery_provider='borzo', delivery_order_id=?, delivery_status=?, delivery_cost=?,
      delivery_tracking_url=?, delivery_courier_name=NULL, delivery_courier_phone=NULL, updated_at=? WHERE id=?`)
    .bind(String(bo.order_id), bo.status || 'new', bo.payment_amount ?? null, trackingUrl(bo), now(), order.id).run();
}

/** Never throws; writes the problem into the order note instead. Returns an error message or null. */
export async function tryBook(env, s, order) {
  try {
    await book(env, s, order);
    return null;
  } catch (e) {
    await addNote(env, order.id, `Borzo booking failed: ${e.message} Book the rider from the order page or the Borzo app.`);
    return e.message;
  }
}

export async function cancelRider(env, order) {
  if (!order.delivery_order_id || ['canceled', 'completed'].includes(order.delivery_status)) return;
  const data = await borzo(env, 'POST', 'cancel-order', { order_id: parseInt(order.delivery_order_id, 10) });
  await env.DB.prepare('UPDATE orders SET delivery_status=?, updated_at=? WHERE id=?').bind(data?.order?.status || 'canceled', now(), order.id).run();
}

export async function fetchBorzoOrder(env, borzoOrderId) {
  const data = await borzo(env, 'GET', 'orders', { order_id: borzoOrderId });
  return data?.orders?.[0] || null;
}

/**
 * Saves the latest Borzo state on our order. Returns { order, target } where target is the
 * shop status the order should move forward to (out_for_delivery / delivered), if any.
 */
export async function applyBorzoOrder(env, bo) {
  const order = await env.DB.prepare("SELECT * FROM orders WHERE delivery_provider='borzo' AND delivery_order_id=?").bind(String(bo?.order_id ?? '')).first();
  if (!order) return { order: null, target: null };

  const status = String(bo.status || order.delivery_status || '');
  const courier = bo.courier || null;
  const courierName = courier ? [courier.name, courier.surname].filter(Boolean).join(' ').trim() || order.delivery_courier_name : order.delivery_courier_name;
  let note = order.admin_note;
  if (status === 'canceled' && order.delivery_status !== 'canceled') {
    note = [note, `Borzo cancelled the rider booking on ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}. Book again from this page.`].filter(Boolean).join('\n');
  }
  await env.DB.prepare(`UPDATE orders SET delivery_status=?, delivery_tracking_url=?, delivery_cost=?, delivery_courier_name=?,
      delivery_courier_phone=?, admin_note=?, updated_at=? WHERE id=?`)
    .bind(status, trackingUrl(bo) || order.delivery_tracking_url, bo.payment_amount ?? order.delivery_cost, courierName,
      courier?.phone || order.delivery_courier_phone, note, now(), order.id).run();

  const target = status === 'active' ? 'out_for_delivery' : status === 'completed' ? 'delivered' : null;
  const forwardFrom = {
    out_for_delivery: ['order_confirmed', 'preparing', 'payment_confirmed'],
    delivered: ['order_confirmed', 'preparing', 'payment_confirmed', 'out_for_delivery'],
  };
  const fresh = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(order.id).first();
  return { order: fresh, target: target && forwardFrom[target].includes(fresh.order_status) ? target : null };
}

export async function addNote(env, orderId, text) {
  await env.DB.prepare("UPDATE orders SET admin_note = TRIM(COALESCE(admin_note,'') || char(10) || ?), updated_at=? WHERE id=?").bind(text, now(), orderId).run();
}
