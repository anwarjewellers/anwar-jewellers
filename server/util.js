// Small helpers shared by the API.

export const now = () => new Date().toISOString();

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const toPaise = (n) => Math.round((Number(n) || 0) * 100);

/** Error the API turns into a JSON response with the given HTTP status. */
export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields; // { fieldName: 'message' } for form validation
  }
}
export const fail = (status, message, fields) => { throw new HttpError(status, message, fields); };

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export const str = (v, max = 255) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));
export const optStr = (v, max = 255) => { const s = str(v, max); return s === '' ? null : s; };
export const int = (v, def = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; };
export const num = (v, def = null) => { const n = Number(v); return v === '' || v === null || v === undefined || !Number.isFinite(n) ? def : n; };

export const bytesToHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(text) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
export async function sha512Hex(text) {
  return bytesToHex(await crypto.subtle.digest('SHA-512', new TextEncoder().encode(text)));
}
export async function hmacSha256Hex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}

/** Constant-time string comparison. */
export function safeEqual(a, b) {
  a = String(a ?? ''); b = String(b ?? '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomToken(bytes = 32) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return bytesToHex(b);
}

export function randomAlnum(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return [...b].map((x) => chars[x % chars.length]).join('');
}

export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** IST date parts for "today/this month" ranges. India has no DST, so a fixed +5:30 offset is exact. */
export const IST_OFFSET_MS = 330 * 60 * 1000;
export const toIst = (d) => new Date(new Date(d).getTime() + IST_OFFSET_MS);
export const fromIstParts = (y, m, day = 1, h = 0, min = 0) => new Date(Date.UTC(y, m, day, h, min) - IST_OFFSET_MS);
