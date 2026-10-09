import { ORDER_STATUS, PAYMENT_STATUS } from '../shared/constants.js';

export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });

export const imageUrl = (key) => (key ? `/images/${key}` : '/placeholder.svg');

export const hasDiscount = (p) => p.original_price && Number(p.original_price) > Number(p.price);
export const discountPercent = (p) => (hasDiscount(p) ? Math.round((1 - p.price / p.original_price) * 100) : 0);

export const dateTime = (iso) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
export const dateOnly = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export const orderStatus = (s) => ORDER_STATUS[s] || { label: s, badge: 'secondary' };
export const paymentStatus = (s) => PAYMENT_STATUS[s] || { label: s, badge: 'secondary' };

export const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

export function setTitle(title, shopName) {
  document.title = title ? `${title} | ${shopName || ''}` : shopName || 'Jewellery';
}
