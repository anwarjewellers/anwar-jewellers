// Transactional emails through Resend (free plan: 3,000 emails/month).
// Set RESEND_API_KEY and MAIL_FROM (e.g. "Anwar Jewellers <orders@yourdomain.com>").
// If RESEND_API_KEY is empty, emails are only logged (handy while testing).
import { ORDER_STATUS } from '../shared/constants.js';
import { escapeHtml, inr } from './util.js';

export async function sendMail(env, { to, subject, html, replyTo }) {
  if (!to) return;
  if (!env.RESEND_API_KEY) {
    console.log(`[mail not sent: RESEND_API_KEY empty] to=${to} subject=${subject}`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html, reply_to: replyTo || undefined }),
    });
    if (!res.ok) console.error('Resend error', res.status, await res.text());
  } catch (e) {
    console.error('Email failed', e.message);
  }
}

function layout(settings, title, body) {
  const shop = escapeHtml(settings.shop_name);
  return `<!doctype html><html><body style="margin:0;background:#f6f3ec;font-family:Arial,sans-serif;color:#222">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="100%" style="max-width:560px;background:#fff;border:1px solid #e6dcc3" cellpadding="0" cellspacing="0">
<tr><td style="background:#0b0b0b;color:#e8cc84;padding:18px 24px;font-size:20px;letter-spacing:2px;text-transform:uppercase">${shop}</td></tr>
<tr><td style="padding:24px"><h2 style="margin:0 0 12px;font-size:20px">${escapeHtml(title)}</h2>${body}</td></tr>
<tr><td style="padding:14px 24px;background:#faf7f0;font-size:12px;color:#777">${shop}${settings.contact_phone ? ' · ' + escapeHtml(settings.contact_phone) : ''}${settings.shop_address ? '<br>' + escapeHtml(settings.shop_address) : ''}</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (url, text) => `<p style="margin:20px 0"><a href="${escapeHtml(url)}" style="background:#c9a24a;color:#111;padding:10px 18px;text-decoration:none;font-weight:bold">${escapeHtml(text)}</a></p>`;

function itemsTable(order, items) {
  const rows = items.map((i) => `<tr><td style="padding:6px 0">${escapeHtml(i.product_name)} × ${i.quantity}</td><td align="right">${inr(i.total)}</td></tr>`).join('');
  return `<table width="100%" style="font-size:14px;border-top:1px solid #eee;margin-top:10px">${rows}
<tr><td style="padding-top:8px;color:#666">Delivery</td><td align="right" style="padding-top:8px">${Number(order.delivery_charge) ? inr(order.delivery_charge) : 'FREE'}</td></tr>
<tr><td style="padding-top:6px"><b>Total paid</b></td><td align="right" style="padding-top:6px"><b>${inr(order.total_amount)}</b></td></tr></table>`;
}

export function orderPaidEmail(settings, origin, order, items) {
  const confirmed = order.order_status === 'order_confirmed';
  const body = `<p>Hi ${escapeHtml(order.shipping_name)},</p>
<p>We have received your payment of <b>${inr(order.total_amount)}</b> for order <b>${escapeHtml(order.order_number)}</b>.
${confirmed ? 'Your order is confirmed and we are getting it ready for delivery.' : 'We will contact you shortly about your order.'}</p>
${itemsTable(order, items)}
<p style="font-size:14px;margin-top:16px"><b>Delivering to:</b><br>${escapeHtml(order.shipping_address)}</p>
${button(`${origin}/orders/${order.id}`, 'View your order')}`;
  return { subject: confirmed ? `Order ${order.order_number} confirmed – payment received` : `Payment received for order ${order.order_number}`, html: layout(settings, 'Thank you for your order!', body) };
}

export function newOrderAdminEmail(settings, origin, order, items) {
  const body = `<p>New paid order <b>${escapeHtml(order.order_number)}</b> for <b>${inr(order.total_amount)}</b>.</p>
<p style="font-size:14px">${escapeHtml(order.shipping_name)} · ${escapeHtml(order.shipping_mobile)}<br>${escapeHtml(order.shipping_address)}</p>
${itemsTable(order, items)}
${button(`${origin}/admin/orders/${order.id}`, 'Open in admin panel')}`;
  return { subject: `New order ${order.order_number} – ${inr(order.total_amount)}`, html: layout(settings, 'New order received', body) };
}

export function statusEmail(settings, origin, order) {
  const label = ORDER_STATUS[order.order_status]?.label || order.order_status;
  const messages = {
    preparing: 'We are preparing your jewellery for delivery.',
    out_for_delivery: 'Your order is on its way to you!',
    delivered: 'Your order has been delivered. We hope you love it!',
    cancelled: 'Your order has been cancelled. If you paid, the refund will reach your account in 5–7 working days.',
  };
  let body = `<p>Hi ${escapeHtml(order.shipping_name)},</p><p>${messages[order.order_status] || ''}</p>
<p>Order <b>${escapeHtml(order.order_number)}</b> is now: <b>${escapeHtml(label)}</b></p>`;
  if (order.order_status === 'out_for_delivery' && order.delivery_tracking_url) {
    body += button(order.delivery_tracking_url, 'Track your delivery live');
    if (order.delivery_courier_name) body += `<p style="font-size:14px">Rider: ${escapeHtml(order.delivery_courier_name)}${order.delivery_courier_phone ? ' · ' + escapeHtml(order.delivery_courier_phone) : ''}</p>`;
  }
  body += button(`${origin}/orders/${order.id}`, 'View your order');
  return { subject: `Order ${order.order_number}: ${label}`, html: layout(settings, `Order update: ${label}`, body) };
}

export function resetEmail(settings, url) {
  const body = `<p>We received a request to reset your password. This link works for 60 minutes.</p>${button(url, 'Reset password')}<p style="font-size:13px;color:#666">If you did not ask for this, you can ignore this email.</p>`;
  return { subject: 'Reset your password', html: layout(settings, 'Reset your password', body) };
}
