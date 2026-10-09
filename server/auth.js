// Passwords (PBKDF2-SHA256), login sessions (HttpOnly cookie) and simple rate limiting.
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { bytesToHex, fail, now, randomToken, safeEqual, sha256Hex } from './util.js';

const ITERATIONS = 100000; // the maximum Cloudflare Workers allows for PBKDF2
const SESSION_DAYS = 30;
const COOKIE = 'sid';

export async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return `pbkdf2$${ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(bits)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, , salt, hash] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2' || !salt || !hash) return false;
  const again = await hashPassword(password, salt);
  return safeEqual(again.split('$')[3], hash);
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain letters and numbers.';
  if (password.length > 200) return 'Password is too long.';
  return null;
}

export async function startSession(c, userId) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, expires.toISOString(), now()).run();
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    expires,
  });
}

export async function endSession(c) {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run();
  deleteCookie(c, COOKIE, { path: '/' });
}

/** Loads the logged-in user (or null) into c.var.user. */
export async function loadUser(c) {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.mobile, u.role, u.firebase_uid, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
  ).bind(await sha256Hex(token)).first();
  if (!row || row.expires_at < now()) return null;
  delete row.expires_at;
  return row;
}

export const publicUser = (u) => (u ? { id: u.id, name: u.name, email: u.email, mobile: u.mobile, isAdmin: u.role === 'ADMIN', firebase: Boolean(u.firebase_uid) } : null);

export function requireUser(c) {
  const user = c.get('user');
  if (!user) fail(401, 'Please log in to continue.');
  return user;
}

export function requireAdmin(c) {
  const user = requireUser(c);
  if (user.role !== 'ADMIN') fail(403, 'Admins only.');
  return user;
}

/**
 * Fixed-window rate limit stored in D1. Throws 429 when exceeded.
 * key example: `login:1.2.3.4`
 */
export async function rateLimit(c, name, max, windowSeconds) {
  const ip = c.req.header('CF-Connecting-IP') || 'local';
  const key = `${name}:${ip}`;
  const t = Math.floor(Date.now() / 1000);
  const row = await c.env.DB.prepare(
    `INSERT INTO rate_limits (key, hits, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       hits = CASE WHEN rate_limits.reset_at <= ?3 THEN 1 ELSE rate_limits.hits + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at <= ?3 THEN ?2 ELSE rate_limits.reset_at END
     RETURNING hits, reset_at`,
  ).bind(key, t + windowSeconds, t).first();
  if (row && row.hits > max) {
    const wait = Math.max(1, row.reset_at - t);
    fail(429, `Too many attempts. Please try again in ${wait > 90 ? Math.ceil(wait / 60) + ' minutes' : wait + ' seconds'}.`);
  }
}
